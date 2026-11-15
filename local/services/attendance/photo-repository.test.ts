import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, renameSync, mkdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { migrate, openAttendance } from './database.ts';
import { recordVisit, cleanupVisits, retentionMs } from './visits.ts';
import { createPhotoRepository } from './photo-repository.ts';
import { photoFilename } from './photo-files.ts';
import { photoConsentVersion, type InternalPhotoUpload } from '../../packages/contracts/photos.ts';
import { listVisits } from './history.ts';

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms006-photo-'));
  let at = Date.parse('2026-11-14T18:00:00Z'); migrate(root);
  const idempotencyKey = randomUUID(), sessionScope = 'a'.repeat(64);
  const visit = recordVisit(root, { name: 'Synthetic photo visitor', netId: 'ab123', idempotencyKey, sessionScope }, at);
  const bytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#537860' } }).jpeg().toBuffer();
  const input: InternalPhotoUpload = { visitId: visit.visitId, idempotencyKey, sessionScope, consent: true, consentVersion: photoConsentVersion, image: bytes.toString('base64') };
  const repo = createPhotoRepository(root, () => at);
  return { root, repo, input, advance: (duration: number) => { at += duration; }, now: () => at,
    dispose: () => { assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('ms006-photo-')); rmSync(root, { recursive: true, force: true }); },
  };
}
it('binds photo consent to the original visit attempt, preserves exact retry and denies overwrite/revoked resurrection', async () => {
  const f = await fixture();
  try {
    await expect(f.repo.save({ ...f.input, sessionScope: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'photo_not_found' }); expect(existsSync(path.join(f.root, 'photos'))).toBe(false);
    const saved = await f.repo.save(f.input); expect(saved).toMatchObject({ saved: true, replayed: false, consentVersion: photoConsentVersion });
    expect(listVisits(f.root, { limit: 25 }, 'b'.repeat(64), f.now()).items[0]).not.toHaveProperty('photoAvailable');
    expect(listVisits(f.root, { limit: 25, photos: '1' }, 'b'.repeat(64), f.now()).items[0]!.photoAvailable).toBe(true);
    expect(f.repo.read(f.input.visitId)).toMatchObject({ photoId: saved.photoId, width: 64, height: 64, mime: 'image/jpeg' });
    const file = photoFilename(f.root, saved.photoId), preserved = readFileSync(file); writeFileSync(file, 'Synthetic corruption');
    expect(() => f.repo.read(f.input.visitId)).toThrow('photo_unavailable'); writeFileSync(file, preserved);
    expect(await f.repo.save(f.input)).toEqual({ ...saved, replayed: true });
    await expect(f.repo.save({ ...f.input, image: Buffer.from([255, 216, 1, 2]).toString('base64') })).rejects.toMatchObject({ code: 'photo_conflict' });
    expect(() => f.repo.remove({ actor: 'visitor', visitId: f.input.visitId, idempotencyKey: f.input.idempotencyKey, sessionScope: 'b'.repeat(64) })).toThrow('photo_not_found');
    const removed = f.repo.remove({ actor: 'visitor', visitId: f.input.visitId, idempotencyKey: f.input.idempotencyKey, sessionScope: f.input.sessionScope });
    expect(removed).toEqual({ removed: true, pendingCleanup: false }); expect(existsSync(photoFilename(f.root, saved.photoId))).toBe(false);
    expect(listVisits(f.root, { limit: 25, photos: '1' }, 'b'.repeat(64), f.now()).items[0]!.photoAvailable).toBe(false);
    expect(() => f.repo.read(f.input.visitId)).toThrow('photo_not_found'); await expect(f.repo.save(f.input)).rejects.toMatchObject({ code: 'photo_conflict' });
    expect(f.repo.remove({ actor: 'staff', visitId: f.input.visitId })).toEqual(removed);
  } finally { f.dispose(); }
});
it('denies late uploads, bounds active codecs and prevents withdrawal during preparation from publishing', async () => {
  const f = await fixture();
  try {
    const pending = f.repo.save(f.input);
    await expect(f.repo.save(f.input)).rejects.toMatchObject({ code: 'rate_limited' });
    f.repo.remove({ actor: 'staff', visitId: f.input.visitId });
    await expect(pending).rejects.toMatchObject({ code: 'photo_conflict' }); expect(() => f.repo.read(f.input.visitId)).toThrow('photo_not_found');
    const nextId = randomUUID(), visit = recordVisit(f.root, { name: 'Synthetic later visitor', netId: 'xy456', idempotencyKey: nextId, sessionScope: f.input.sessionScope }, f.now());
    f.advance(300000); await expect(f.repo.save({ ...f.input, visitId: visit.visitId, idempotencyKey: nextId })).rejects.toMatchObject({ code: 'photo_not_found' });
  } finally { f.dispose(); }
});
it('makes expired photos unreadable before cleanup and queues/deletes only owned retained files', async () => {
  const f = await fixture();
  try {
    const saved = await f.repo.save(f.input); const unrelated = path.join(f.root, 'photos', 'keep.txt'); writeFileSync(unrelated, 'Synthetic unrelated fixture.');
    f.advance(retentionMs); expect(() => f.repo.read(f.input.visitId)).toThrow('photo_not_found'); expect(existsSync(photoFilename(f.root, saved.photoId))).toBe(true);
    expect(cleanupVisits(f.root, f.now())).toBe(1); expect(f.repo.cleanup()).toEqual({ removed: 1, pending: 0, failed: false });
    expect(existsSync(photoFilename(f.root, saved.photoId))).toBe(false); expect(readFileSync(unrelated, 'utf8')).toBe('Synthetic unrelated fixture.');
  } finally { f.dispose(); }
});
it('retains failed file cleanup for retry and refuses the active/queued quota', async () => {
  const f = await fixture();
  try {
    const saved = await f.repo.save(f.input), file = photoFilename(f.root, saved.photoId), backup = file + '.fixture';
    assert.equal(path.dirname(file), path.join(f.root, 'photos')); assert.equal(path.dirname(backup), path.dirname(file));
    renameSync(file, backup); mkdirSync(file); // An owned non-file leaf must never be recursively deleted.
    expect(f.repo.remove({ actor: 'staff', visitId: f.input.visitId })).toEqual({ removed: true, pendingCleanup: true });
    expect(f.repo.cleanup()).toEqual({ removed: 0, pending: 1, failed: true });
    rmdirSync(file); renameSync(backup, file); expect(f.repo.cleanup()).toEqual({ removed: 1, pending: 0, failed: false });
    const db = openAttendance(f.root); db.transaction(() => { for (let index = 0; index < 1000; index++) db.prepare('INSERT INTO photo_cleanup VALUES (?,?,?)').run(randomUUID(), f.input.visitId, f.now()); })(); db.close();
    const nextId = randomUUID(), visit = recordVisit(f.root, { name: 'Synthetic quota visitor', netId: 'cd789', idempotencyKey: nextId, sessionScope: f.input.sessionScope }, f.now());
    await expect(f.repo.save({ ...f.input, visitId: visit.visitId, idempotencyKey: nextId })).rejects.toMatchObject({ code: 'photo_unavailable' });
  } finally { f.dispose(); }
});

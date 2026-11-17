import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { createFaceRepository, enrollmentRetention } from './repository.ts';
import { migrateFace, openFace } from './database.ts';
import { syntheticFaceSettings, syntheticVector } from '../../tests/face-fixture.ts';

const proof = () => ({ visitId: randomUUID(), sessionScope: 'a'.repeat(64), idempotencyKey: randomUUID() });
const identity = { name: 'Synthetic Face Visitor', netId: 'syntheticface' };
const image = Buffer.from([255, 216, 255, 1]);
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms007-repo-')); syntheticFaceSettings(root); migrateFace(root);
  let at = 1000000;
  return { root, repo: createFaceRepository(root, () => at), advance: (duration: number) => { at += duration; }, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
it('encrypts identity/templates, replays exact enrollment and rejects changed images or duplicate galleries', () => {
  const f = fixture();
  try {
    const original = proof(), saved = f.repo.enroll(original, image, identity, syntheticVector());
    expect(f.repo.enroll(original, image, identity, syntheticVector())).toEqual({ ...saved, replayed: true });
    expect(() => f.repo.enroll(original, Buffer.from([255, 216, 255, 2]), identity, syntheticVector())).toThrow('face_conflict');
    expect(() => f.repo.enroll(proof(), image, identity, syntheticVector(1))).toThrow('face_conflict');
    expect(() => f.repo.enroll(proof(), image, { name: 'Other synthetic visitor', netId: 'syntheticother' }, syntheticVector())).toThrow('face_conflict');
    const db = openFace(f.root), row = db.prepare('SELECT * FROM enrollments').get() as { ciphertext: Buffer; generation: string };
    expect(row.ciphertext).toBeInstanceOf(Buffer);
    const bytes = Buffer.concat([readFileSync(path.join(f.root, 'face.sqlite')), ...(readFileSync(path.join(f.root, 'face.sqlite-wal')).length ? [readFileSync(path.join(f.root, 'face.sqlite-wal'))] : [])]);
    expect(bytes.includes(Buffer.from(identity.name))).toBe(false); expect(bytes.includes(Buffer.from(identity.netId))).toBe(false);
    expect(bytes.includes(Buffer.from(saved.withdrawalCode))).toBe(false); expect(bytes.includes(Buffer.from(original.sessionScope))).toBe(false);
    expect(f.repo.match(syntheticVector())).toEqual({ enrollmentId: saved.enrollmentId, generation: row.generation });
    expect(f.repo.consume(saved.enrollmentId, row.generation)).toEqual(identity); db.close();
  } finally { f.dispose(); }
});
it('revokes by own code, hides invalid codes, and tombstones withdrawal before delayed publication', () => {
  const f = fixture();
  try {
    const original = proof(), saved = f.repo.enroll(original, image, identity, syntheticVector());
    const matched = f.repo.match(syntheticVector())!;
    expect(f.repo.withdraw({ code: 'invalid' })).toEqual({ removed: true }); expect(f.repo.list().records).toHaveLength(1);
    expect(f.repo.withdraw({ code: saved.withdrawalCode })).toEqual({ removed: true }); expect(f.repo.list().records).toHaveLength(0);
    expect(f.repo.match(syntheticVector())).toBe(null); expect(() => f.repo.consume(matched.enrollmentId, matched.generation)).toThrow('face_not_found');
    expect(() => f.repo.enroll(original, image, identity, syntheticVector())).toThrow('face_conflict');
    const delayed = proof(); f.repo.withdraw(delayed);
    expect(() => f.repo.enroll(delayed, image, identity, syntheticVector())).toThrow('face_conflict');
    const db = openFace(f.root); expect(db.prepare('SELECT ciphertext FROM enrollments').all()).toEqual([{ ciphertext: null }, { ciphertext: null }]); db.close();
  } finally { f.dispose(); }
});
it('fails closed on wrong/missing keys and authenticated ciphertext/metadata tampering', () => {
  const f = fixture();
  try {
    const saved = f.repo.enroll(proof(), image, identity, syntheticVector());
    const key = readFileSync(path.join(f.root, 'encryption.key')); writeFileSync(path.join(f.root, 'encryption.key'), Buffer.alloc(32));
    expect(() => f.repo.list()).toThrow('face_unavailable'); writeFileSync(path.join(f.root, 'encryption.key'), key);
    const db = openFace(f.root), row = db.prepare('SELECT ciphertext FROM enrollments WHERE id=?').get(saved.enrollmentId) as { ciphertext: Buffer };
    const damaged = Buffer.from(row.ciphertext); damaged[28] = damaged[28]! ^ 1;
    db.prepare('UPDATE enrollments SET ciphertext=? WHERE id=?').run(damaged, saved.enrollmentId);
    expect(() => f.repo.match(syntheticVector())).toThrow('face_unavailable');
    db.prepare('UPDATE enrollments SET ciphertext=?,expires_at=expires_at+1 WHERE id=?').run(row.ciphertext, saved.enrollmentId);
    expect(() => f.repo.list()).toThrow('face_unavailable'); db.close();
  } finally { f.dispose(); }
});
it('enforces read-time expiry before cleanup and bounded protected pagination', () => {
  const f = fixture();
  try {
    for (let index = 0; index < 26; index++) f.repo.enroll(proof(), image, { name: 'Synthetic visitor', netId: `synthetic${index}` }, syntheticVector(index));
    const first = f.repo.list(); expect(first.records).toHaveLength(25); expect(first.next).toBe(first.records[24]!.enrollmentId);
    const second = f.repo.list(first.next!); expect(second.records).toHaveLength(1); expect(second.next).toBe(null);
    f.advance(enrollmentRetention); expect(f.repo.list().records).toHaveLength(0); expect(f.repo.match(syntheticVector())).toBe(null);
    expect(f.repo.cleanup()).toBe(26); expect(f.repo.cleanup()).toBe(0);
    const db = openFace(f.root); db.pragma('user_version=2'); db.close(); expect(() => migrateFace(f.root)).toThrow();
  } finally { f.dispose(); }
});


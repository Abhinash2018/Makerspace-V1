import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, renameSync, mkdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { photoConsentVersion } from '../../packages/contracts/photos.ts';
import { migrate } from './database.ts';
import { recordVisit } from './visits.ts';
import { createPhotoRepository } from './photo-repository.ts';
import { photoFilename } from './photo-files.ts';
import { createAttendance } from './index.ts';
import { syntheticJpeg } from '../../tests/jpeg-fixture.ts';

it('keeps failed photo cleanup unready across successful check-in and recovers only after a successful sweep', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms006-maintenance-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root), at = Date.parse('2026-11-14T18:00:00Z');
  migrate(config.runtime.attendance);
  const idempotencyKey = randomUUID(), sessionScope = 'b'.repeat(64), visit = recordVisit(config.runtime.attendance, { name: 'Synthetic maintenance visitor', netId: 'ab123', idempotencyKey, sessionScope }, at);
  const saved = await createPhotoRepository(config.runtime.attendance, () => at).save({ visitId: visit.visitId, idempotencyKey, sessionScope, consent: true, consentVersion: photoConsentVersion, image: (await syntheticJpeg()).toString('base64') });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const app = createAttendance(config, () => at), headers = { host: '127.0.0.1:3001', 'x-internal-service-token': config.serviceToken };
  try {
    await app.ready(); const file = photoFilename(config.runtime.attendance, saved.photoId), backup = file + '.fixture';
    assert.equal(path.dirname(file), path.join(config.runtime.attendance, 'photos')); assert.equal(path.dirname(file), path.dirname(backup));
    renameSync(file, backup); mkdirSync(file);
    const removed = await app.inject({ method: 'POST', url: '/internal/v1/visit-photo/remove', headers, payload: { actor: 'staff', visitId: visit.visitId } }); expect(removed.statusCode).toBe(200); expect(removed.json().pendingCleanup).toBe(true);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: { name: 'Synthetic independent check-in', netId: 'xy456', idempotencyKey: randomUUID(), sessionScope } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(503);
    rmdirSync(file); renameSync(backup, file); vi.advanceTimersByTime(3600000);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(200);
  } finally { await app.close(); vi.useRealTimers(); assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('ms006-maintenance-')); rmSync(root, { recursive: true, force: true }); }
});

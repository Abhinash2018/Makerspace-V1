import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { syntheticFaceSettings } from '../face-fixture.ts';
import { createFaceRepository } from '../../services/face/repository.ts';
import { migrateFace, openFace } from '../../services/face/database.ts';

// This real encrypted-gallery setup is deliberately run after the ordinary unit
// suite, so its cumulative CPU work cannot starve bounded PDF/photo workers.
it('refuses enrollment beyond the 1000-template gallery quota without replacing existing consent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms007-capacity-'));
  syntheticFaceSettings(root); migrateFace(root);
  const repo = createFaceRepository(root, () => 1000000), image = Buffer.from([255, 216, 255, 1]);
  const proof = () => ({ visitId: randomUUID(), sessionScope: 'a'.repeat(64), idempotencyKey: randomUUID() });
  let seed = 0x12345678;
  const vector = () => Array.from({ length: 128 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000 - 0.5; });
  try {
    for (let index = 0; index < 1000; index++) repo.enroll(proof(), image, { name: 'Synthetic quota visitor', netId: `quota${index}` }, vector());
    const first = repo.list().records[0]!;
    expect(() => repo.enroll(proof(), image, { name: 'Synthetic over-quota visitor', netId: 'quotaoverflow' }, vector())).toThrow('face_unavailable');
    const db = openFace(root); expect(db.prepare('SELECT count(*) AS n FROM enrollments WHERE ciphertext IS NOT NULL').get()).toEqual({ n: 1000 }); db.close();
    expect(repo.list().records[0]!.enrollmentId).toBe(first.enrollmentId);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('ms007-capacity-'));
    rmSync(root, { recursive: true, force: true });
  }
}, 180000);

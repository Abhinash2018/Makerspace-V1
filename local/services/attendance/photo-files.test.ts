import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, renameSync, symlinkSync, unlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { imageHash, photoFilename, readPrivatePhoto, writePrivatePhoto } from './photo-files.ts';

it('uses exclusive UUID leaves, bounded integrity reads and refuses traversal/junction parents', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms006-file-'));
  try {
    const id = randomUUID(), bytes = Buffer.from([255, 216, 255, 217]);
    writePrivatePhoto(root, id, bytes); expect(readPrivatePhoto(root, id, bytes.length, imageHash(bytes))).toEqual(bytes);
    expect(() => writePrivatePhoto(root, id, bytes)).toThrow('photo_unavailable');
    expect(() => photoFilename(root, '../other')).toThrow('photo_unavailable');
    const current = path.join(root, 'photos'), preserved = path.join(root, 'preserved'), target = path.join(root, 'target');
    for (const file of [current, preserved, target]) assert.equal(path.dirname(file), root);
    renameSync(current, preserved); mkdirSync(target); symlinkSync(target, current, 'junction');
    expect(() => writePrivatePhoto(root, randomUUID(), bytes)).toThrow('photo_unavailable'); expect(readdirSync(target)).toEqual([]);
    unlinkSync(current); renameSync(preserved, current);
  } finally { assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith('ms006-file-')); rmSync(root, { recursive: true, force: true }); }
});

import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkRuntimePath } from '../../packages/config/index.mjs';
import { PhotoFailure } from './photo-codec.ts';

export const imageHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function photoFilename(directory: string, id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new PhotoFailure('photo_unavailable');
  const parent = path.resolve(directory, 'photos');
  checkRuntimePath(path.parse(parent).root, parent);
  return path.join(parent, `${id}.jpg`);
}
export function writePrivatePhoto(directory: string, id: string, bytes: Uint8Array): void {
  let descriptor: number | undefined;
  try {
    if (bytes.length < 4 || bytes.length > 262144) throw new Error();
    const file = photoFilename(directory, id); mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    descriptor = openSync(file, 'wx', 0o600); writeFileSync(descriptor, bytes); fsyncSync(descriptor);
  } catch { throw new PhotoFailure('photo_unavailable'); } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function readPrivatePhoto(directory: string, id: string, expectedBytes: number, hash: string): Buffer {
  let descriptor: number | undefined;
  try {
    const file = photoFilename(directory, id), leaf = lstatSync(file);
    if (!leaf.isFile() || leaf.isSymbolicLink() || !Number.isInteger(expectedBytes) || expectedBytes < 4 || expectedBytes > 262144 || leaf.size !== expectedBytes) throw new Error();
    descriptor = openSync(file, 'r'); if (fstatSync(descriptor).size !== expectedBytes) throw new Error();
    const buffer = Buffer.alloc(expectedBytes + 1); let length = 0, count = 0;
    do { count = readSync(descriptor, buffer, length, buffer.length - length, null); length += count; } while (count && length < buffer.length);
    const bytes = buffer.subarray(0, length);
    if (length !== expectedBytes || bytes[0] !== 255 || bytes[1] !== 216 || imageHash(bytes) !== hash) throw new Error();
    return bytes;
  } catch { throw new PhotoFailure('photo_unavailable'); } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function unlinkPrivatePhoto(directory: string, id: string): void {
  try {
    const file = photoFilename(directory, id);
    let leaf;
    try { leaf = lstatSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (!leaf.isFile() || leaf.isSymbolicLink()) throw new Error();
    unlinkSync(file);
  } catch { throw new PhotoFailure('photo_unavailable'); }
}

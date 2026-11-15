import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { checkRuntimePath } from '../../packages/config/index.mjs';

const maxBytes = 10 * 1024 * 1024;
export class SourceFailure extends Error { constructor() { super('source_unavailable'); } }
export const sourceHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function checkedFile(file: string) {
  if (typeof file !== 'string' || !file || /^[a-z][a-z0-9+.-]*:\/\//i.test(file) || /^[\\/]{2}/.test(file)) throw new SourceFailure();
  const resolved = path.resolve(file);
  checkRuntimePath(path.parse(resolved).root, path.dirname(resolved));
  return resolved;
}
export function readPdfSource(file: string): Uint8Array {
  let descriptor: number | undefined;
  try {
    const resolved = checkedFile(file);
    if (lstatSync(resolved).isSymbolicLink()) throw new SourceFailure();
    descriptor = openSync(resolved, 'r');
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes || stat.size < 5) throw new SourceFailure();
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0, count = 0;
    do { count = readSync(descriptor, buffer, length, buffer.length - length, null); length += count; } while (count && length < buffer.length);
    if (length > maxBytes || length < 5) throw new SourceFailure();
    return Uint8Array.from(buffer.subarray(0, length));
  } catch { throw new SourceFailure(); } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function privateSourcePath(directory: string, hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new SourceFailure();
  return path.join(directory, 'sources', `${hash}.pdf`);
}
export function preparePrivateSource(directory: string, bytes: Uint8Array): string {
  const hash = sourceHash(bytes), file = privateSourcePath(directory, hash);
  let descriptor: number | undefined;
  try {
    checkedFile(file); mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try { descriptor = openSync(file, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || sourceHash(readPdfSource(file)) !== hash) throw new SourceFailure();
      return hash;
    }
    writeFileSync(descriptor, bytes); fsyncSync(descriptor); return hash;
  } catch { throw new SourceFailure(); } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

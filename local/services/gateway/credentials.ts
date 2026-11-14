import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkRuntimePath } from '../../packages/config/index.mjs';

type StaffCredential = Readonly<{ version: 1; algorithm: 'scrypt'; N: number; r: number; p: number; salt: string; hash: string }>;
const parameters = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
export class StaffCredentialError extends Error {
  constructor() { super('Staff credential unavailable; check the private credential file and provisioning instructions.'); }
}
function passwordAllowed(password: unknown): password is string {
  return typeof password === 'string' && password.length <= 256 && [...password].length >= 15 && [...password].length <= 128
    && Buffer.byteLength(password) <= 512 && !password.includes('\0');
}
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, 'base64url'), 64, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}
function checkDirectory(directory: string) { checkRuntimePath(path.parse(path.resolve(directory)).root, path.resolve(directory)); }
function parseRecord(value: unknown): StaffCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StaffCredentialError();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'N,algorithm,hash,p,r,salt,version'
    || row.version !== 1 || row.algorithm !== 'scrypt' || row.N !== parameters.N || row.r !== 8 || row.p !== 1
    || typeof row.salt !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(row.salt)
    || typeof row.hash !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(row.hash)
    || Buffer.from(row.salt, 'base64url').toString('base64url') !== row.salt
    || Buffer.from(row.hash, 'base64url').toString('base64url') !== row.hash) throw new StaffCredentialError();
  return Object.freeze({ version: 1, algorithm: 'scrypt', N: parameters.N, r: 8, p: 1, salt: row.salt, hash: row.hash });
}
export function loadStaffCredential(directory: string): StaffCredential | undefined {
  let descriptor: number | undefined;
  try {
    checkDirectory(directory);
    const file = path.join(directory, 'staff-credential.json');
    if (lstatSync(file).isSymbolicLink()) throw new StaffCredentialError();
    descriptor = openSync(file, 'r');
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 2048) throw new StaffCredentialError();
    return parseRecord(JSON.parse(readFileSync(descriptor, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new StaffCredentialError();
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export async function provisionStaff(directory: string, password: string): Promise<void> {
  if (!passwordAllowed(password)) throw new Error('Use a password of 15–128 characters, at most 512 UTF-8 bytes, without NUL.');
  try {
    checkDirectory(directory);
    const file = path.join(directory, 'staff-credential.json');
    try { lstatSync(file); throw new StaffCredentialError(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const salt = randomBytes(16).toString('base64url');
    const hash = (await derive(password, salt)).toString('base64url');
    checkDirectory(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(file, `${JSON.stringify({ version: 1, algorithm: 'scrypt', N: parameters.N, r: 8, p: 1, salt, hash })}\n`, { flag: 'wx', mode: 0o600 });
  } catch { throw new StaffCredentialError(); }
}
export function createStaffVerifier(record: StaffCredential | undefined) {
  let busy = false;
  return async (password: unknown): Promise<'ok' | 'invalid' | 'unavailable' | 'busy'> => {
    if (!record) return 'unavailable';
    if (busy) return 'busy';
    if (!passwordAllowed(password)) return 'invalid';
    busy = true;
    try {
      const key = await derive(password, record.salt);
      return timingSafeEqual(key, Buffer.from(record.hash, 'base64url')) ? 'ok' : 'invalid';
    } catch { return 'unavailable'; }
    finally { busy = false; }
  };
}

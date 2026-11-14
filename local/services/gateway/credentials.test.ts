import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createStaffVerifier, loadStaffCredential, provisionStaff, StaffCredentialError } from './credentials.ts';

const password = 'synthetic staff passphrase 001';
it('provisions a salted fixed-cost hash exclusively and bounds concurrent password verification', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms001-credential-'));
  try {
    expect(loadStaffCredential(root)).toBeUndefined();
    expect(await createStaffVerifier(undefined)(password)).toBe('unavailable');
    const directory = path.join(root, 'gateway');
    await provisionStaff(directory, password);
    const source = readFileSync(path.join(directory, 'staff-credential.json'), 'utf8');
    expect(source).not.toContain(password);
    expect(loadStaffCredential(directory)).toMatchObject({ N: 131072, r: 8, p: 1, algorithm: 'scrypt', version: 1 });
    const verify = createStaffVerifier(loadStaffCredential(directory));
    const first = verify(password);
    expect(await verify(password)).toBe('busy');
    expect(await first).toBe('ok');
    expect(await verify('incorrect synthetic passphrase')).toBe('invalid');
    for (const invalid of [null, 42, '', 'short', 'x'.repeat(129), 'x'.repeat(20) + '\0']) expect(await verify(invalid)).toBe('invalid');
    await expect(provisionStaff(directory, 'different synthetic password')).rejects.toThrow(StaffCredentialError);
    expect(readFileSync(path.join(directory, 'staff-credential.json'), 'utf8')).toBe(source);
    await provisionStaff(path.join(root, 'second'), password);
    expect(loadStaffCredential(path.join(root, 'second'))?.salt).not.toBe(loadStaffCredential(directory)?.salt);
    await expect(provisionStaff(path.join(root, 'invalid'), 'short')).rejects.toThrow('15–128');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('rejects malformed/oversized/unsupported credential files and symlinked runtime directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms001-invalid-credential-'));
  try {
    const file = path.join(root, 'staff-credential.json');
    for (const content of ['{', 'null', '{}', '[]', 'x'.repeat(2049), JSON.stringify({ version: 1, algorithm: 'scrypt', N: 2147483648, r: 8, p: 1, salt: 'a'.repeat(22), hash: 'a'.repeat(86) })]) {
      writeFileSync(file, content);
      expect(() => loadStaffCredential(root)).toThrow(StaffCredentialError);
    }
    const external = path.join(root, 'external'); mkdirSync(external);
    const linked = path.join(root, 'linked'); symlinkSync(external, linked, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => loadStaffCredential(linked)).toThrow(StaffCredentialError);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

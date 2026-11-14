import { spawnSync } from 'node:child_process';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { readPassword } from './provision-staff.ts';

it('reads a synthetic secret without echoing it and closes on cancellation', async () => {
  const input = new PassThrough();
  let displayed = '';
  const output = new Writable({ write(chunk, _encoding, done) { displayed += String(chunk); done(); } });
  const reading = readPassword(input, output, 'Password: ', AbortSignal.timeout(2000));
  input.write('synthetic terminal passphrase\r');
  expect(await reading).toBe('synthetic terminal passphrase');
  expect(displayed).toBe('Password: \n');
  const abort = new AbortController();
  const cancelled = readPassword(input, output, 'Password: ', abort.signal);
  abort.abort();
  await expect(cancelled).rejects.toThrow();
  expect(input.listenerCount('keypress')).toBe(0);
  input.end(); output.end();
});

it('refuses non-terminal password input and command-line arguments without exposing supplied text', () => {
  for (const args of [[], ['synthetic-command-line-password']]) {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./provision-staff.ts', import.meta.url)), ...args], { encoding: 'utf8', input: 'synthetic stdin password\n', timeout: 5000 });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('interactive terminal');
    expect(child.stdout + child.stderr).not.toContain('synthetic');
  }
});

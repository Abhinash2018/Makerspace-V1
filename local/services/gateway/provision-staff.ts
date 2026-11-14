import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import path from 'node:path';
import { loadConfiguration } from '../../packages/config/index.mjs';
import { provisionStaff } from './credentials.ts';

// Readline handles terminal editing/raw-mode restoration; its output is muted
// so neither typing nor pasted passwords are echoed. No command-line secrets.
export async function readPassword(input: NodeJS.ReadableStream, output: NodeJS.WritableStream, prompt: string, signal: AbortSignal) {
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input, output: muted, terminal: true, historySize: 0 });
  const interrupted = new AbortController();
  reader.once('SIGINT', () => interrupted.abort());
  output.write(prompt);
  try { return await reader.question('', { signal: AbortSignal.any([signal, interrupted.signal]) }); }
  finally { reader.close(); muted.end(); output.write('\n'); }
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('terminal_required');
    }
    const directory = path.join(loadConfiguration().runtime.root, 'gateway');
    const signal = AbortSignal.timeout(120_000);
    const password = await readPassword(process.stdin, process.stdout, 'New staff password: ', signal);
    const confirmation = await readPassword(process.stdin, process.stdout, 'Confirm staff password: ', signal);
    if (password !== confirmation) throw new Error('mismatch');
    await provisionStaff(directory, password);
    console.log('Staff credential created. Restart the gateway to load it.');
  } catch {
    console.error('Staff provisioning failed. Use an interactive terminal with no arguments, matching 15–128 character passwords and no existing credential file. Nothing is overwritten.');
    process.exitCode = 1;
  }
}

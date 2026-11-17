import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FaceFailure } from './settings.ts';

export function createInference(directory: string) {
  let active = false;
  return async (bytes: Uint8Array, signal?: AbortSignal, budget = 12000): Promise<number[]> => {
    if (active) throw new FaceFailure('rate_limited');
    if (signal?.aborted) throw new FaceFailure();
    if (bytes.length < 4 || bytes.length > 524288 || bytes[0] !== 255 || bytes[1] !== 216) throw new FaceFailure('invalid_face');
    active = true;
    try {
      return await new Promise<number[]>((resolve, reject) => {
        const child = fork(fileURLToPath(new URL('./worker.ts', import.meta.url)), [], { serialization: 'advanced', execArgv: ['--max-old-space-size=128'], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          env: { ORT_DISABLE_TELEMETRY: '1', PATH: process.env.PATH, ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } : { TMPDIR: process.env.TMPDIR }) } });
        let settled = false;
        const finish = (error?: FaceFailure, vector?: number[]) => {
          if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          const complete = () => error ? reject(error) : resolve(vector!);
          if (!child.pid || child.exitCode !== null || child.signalCode !== null) complete(); else { child.once('exit', complete); child.kill('SIGKILL'); }
        };
        const abort = () => finish(new FaceFailure());
        const timer = setTimeout(abort, Number.isFinite(budget) ? Math.max(1, Math.min(12000, budget)) : 12000);
        signal?.addEventListener('abort', abort, { once: true });
        child.once('error', abort); child.once('exit', () => { if (!settled) abort(); });
        child.once('message', (message: { embedding?: unknown; error?: unknown }) => {
          const vector = message?.embedding;
          if (!Array.isArray(vector) || vector.length !== 128 || vector.some(n => typeof n !== 'number' || !Number.isFinite(n)) || Math.abs(Math.hypot(...vector as number[]) - 1) > 1e-5) {
            finish(new FaceFailure(message?.error === 'invalid_face' ? 'invalid_face' : 'face_unavailable')); return;
          }
          finish(undefined, vector as number[]);
        });
        child.send({ directory, bytes: Buffer.from(bytes) }, error => { if (error) abort(); });
      });
    } finally { active = false; }
  };
}

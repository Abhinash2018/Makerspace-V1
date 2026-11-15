import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class PhotoFailure extends Error {
  readonly code: 'invalid_photo' | 'photo_unavailable' | 'photo_not_found' | 'photo_conflict' | 'rate_limited';
  constructor(code: PhotoFailure['code']) { super(code); this.code = code; }
}
export async function sanitizePhoto(bytes: Uint8Array, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ bytes: Buffer; width: number; height: number }> {
  if (options.signal?.aborted) throw new PhotoFailure('photo_unavailable');
  if (bytes.length < 4 || bytes.length > 524288 || bytes[0] !== 255 || bytes[1] !== 216) throw new PhotoFailure('invalid_photo');
  const child = fork(fileURLToPath(new URL('./photo-worker.ts', import.meta.url)), [], { serialization: 'advanced', execArgv: ['--max-old-space-size=96'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    env: { PATH: process.env.PATH, ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } : { TMPDIR: process.env.TMPDIR }) },
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const duration = Math.max(1, Math.min(options.timeoutMs ?? 5000, 5000));
    const timer = setTimeout(() => finish(new PhotoFailure('photo_unavailable')), Number.isFinite(duration) ? duration : 5000);
    const abort = () => finish(new PhotoFailure('photo_unavailable'));
    const finish = (error?: PhotoFailure, result?: { bytes: Buffer; width: number; height: number }) => {
      if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      const complete = () => { if (error) reject(error); else resolve(result!); };
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) complete(); else { child.once('exit', complete); child.kill('SIGKILL'); }
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    child.once('message', (message: { bytes?: unknown; width?: unknown; height?: unknown }) => {
      if (!(message?.bytes instanceof Uint8Array) || message.bytes.length < 4 || message.bytes.length > 262144 || message.bytes[0] !== 255 || message.bytes[1] !== 216
        || !Number.isInteger(message.width) || !Number.isInteger(message.height) || Number(message.width) < 1 || Number(message.width) > 640 || Number(message.height) < 1 || Number(message.height) > 640) { finish(new PhotoFailure('invalid_photo')); return; }
      finish(undefined, { bytes: Buffer.from(message.bytes), width: Number(message.width), height: Number(message.height) });
    });
    child.once('error', () => finish(new PhotoFailure('photo_unavailable')));
    child.once('exit', () => { if (!settled) finish(new PhotoFailure('photo_unavailable')); });
    child.send({ bytes: Buffer.from(bytes) }, error => { if (error) finish(new PhotoFailure('photo_unavailable')); });
  });
}

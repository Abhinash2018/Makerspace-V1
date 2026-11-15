import { Worker } from 'node:worker_threads';

export type PdfPage = Readonly<{ page: number; text: string }>;
export type PdfExtraction = Readonly<{ pages: readonly PdfPage[]; pageCount: number; emptyPages: readonly number[] }>;
export class PdfFailure extends Error {
  readonly code: 'invalid_pdf' | 'parse_failed' | 'pdf_limits' | 'no_text' | 'password_required' | 'timeout' | 'cancelled';
  constructor(code: PdfFailure['code']) { super(code); this.code = code; }
}
export async function extractPdf(bytes: Uint8Array, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<PdfExtraction> {
  if (options.signal?.aborted) throw new PdfFailure('cancelled');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 10 * 1024 * 1024) throw new PdfFailure('pdf_limits');
  if (!Buffer.from(bytes.subarray(0, 1024)).includes(Buffer.from('%PDF-'))) throw new PdfFailure('invalid_pdf');
  const worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), {
    workerData: { bytes: Uint8Array.from(bytes) }, stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
  });
  worker.stdout?.resume(); worker.stderr?.resume();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: PdfFailure, result?: PdfExtraction) => {
      if (settled) return; settled = true;
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      void worker.terminate().finally(() => { if (error) reject(error); else resolve(result!); });
    };
    const abort = () => finish(new PdfFailure('cancelled'));
    const duration = Math.max(1, Math.min(options.timeoutMs ?? 10000, 10000));
    const timer = setTimeout(() => finish(new PdfFailure('timeout')), Number.isFinite(duration) ? duration : 10000);
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', (message: { pages?: unknown; error?: unknown }) => {
      if (typeof message.error === 'string') {
        const code = ['pdf_limits', 'no_text', 'password_required'].includes(message.error) ? message.error as PdfFailure['code'] : 'parse_failed';
        finish(new PdfFailure(code)); return;
      }
      const pages = message.pages as PdfPage[] | undefined;
      if (!Array.isArray(pages) || !pages.length || pages.length > 100 || pages.some((page, index) => page.page !== index + 1 || typeof page.text !== 'string' || page.text.length > 100000)
        || pages.reduce((size, page) => size + page.text.length, 0) > 1000000) { finish(new PdfFailure('parse_failed')); return; }
      finish(undefined, Object.freeze({ pages: Object.freeze(pages.map(page => Object.freeze(page))), pageCount: pages.length, emptyPages: Object.freeze(pages.filter(page => !page.text).map(page => page.page)) }));
    });
    worker.once('error', () => finish(new PdfFailure('parse_failed')));
    worker.once('exit', () => { if (!settled) finish(new PdfFailure('parse_failed')); });
  });
}

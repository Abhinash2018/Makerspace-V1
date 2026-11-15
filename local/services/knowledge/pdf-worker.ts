import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

if (!parentPort) throw new Error('Worker entrypoint only.');
const output = parentPort;
globalThis.fetch = async () => { throw new Error('Network disabled during PDF extraction.'); };
const packageRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const directory = (name: string) => pathToFileURL(path.join(packageRoot, name) + path.sep).href;
let loading: ReturnType<typeof getDocument> | undefined;
try {
  loading = getDocument({ data: new Uint8Array(workerData.bytes),
    enableXfa: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false,
    disableWorkerRendering: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: 0,
    useWasm: false, disableAutoFetch: true, disableRange: true, disableStream: true, stopAtErrors: true, verbosity: 0,
    cMapUrl: directory('cmaps'), cMapPacked: true, standardFontDataUrl: directory('standard_fonts'),
  });
  const document = await loading.promise;
  if (document.numPages < 1 || document.numPages > 100) throw new Error('pdf_limits');
  const pages: { page: number; text: string }[] = [];
  let total = 0;
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
      .normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ').replace(/\s+/gu, ' ').trim();
    total += text.length;
    if (text.length > 100_000 || total > 1_000_000) throw new Error('pdf_limits');
    pages.push({ page: number, text }); page.cleanup();
  }
  if (!total) throw new Error('no_text');
  await loading.destroy(); loading = undefined;
  output.postMessage({ pages });
} catch (error) {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  output.postMessage({ error: name === 'PasswordException' ? 'password_required' : ['pdf_limits', 'no_text'].includes(message) ? message : 'parse_failed' });
} finally { if (loading) await loading.destroy().catch(() => undefined); }

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { PdfExtraction } from './pdf.ts';

const extraction = z.strictObject({ pages: z.array(z.strictObject({ page: z.number().int().min(1).max(100), text: z.string().max(100000) })).min(1).max(100),
  pageCount: z.number().int().min(1).max(100), emptyPages: z.array(z.number().int().min(1).max(100)).max(100) });
// Operator CLI only. The caller passes an already validated, private PDF copy.
export async function extractOcr(file: string, signal: AbortSignal): Promise<PdfExtraction> {
  if (signal.aborted || process.platform !== 'win32' || !process.env.SystemRoot) throw new Error('ocr_unavailable');
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', fileURLToPath(new URL('./ocr-windows.ps1', import.meta.url)), '-InputFile', file],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } });
    const parts: Buffer[] = []; let size = 0, failed = false;
    const stop = () => { failed = true; child.kill(); };
    const timer = setTimeout(stop, 300000);
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    child.stdout.on('data', (part: Buffer) => { size += part.length; if (size > 4194304) stop(); else parts.push(part); });
    child.once('error', () => { failed = true; });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
      try {
        if (failed || code !== 0 || signal.aborted) throw new Error('ocr_unavailable');
        const result = extraction.parse(JSON.parse(Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/, '')));
        if (result.pages.length !== result.pageCount || result.pages.some((page, index) => page.page !== index + 1)
          || result.pages.reduce((sum, page) => sum + page.text.length, 0) > 1000000
          || JSON.stringify(result.emptyPages) !== JSON.stringify(result.pages.filter(page => !page.text.trim()).map(page => page.page))
          || result.emptyPages.length === result.pageCount) throw new Error('ocr_unavailable');
        resolve(result);
      } catch { reject(new Error('ocr_unavailable')); }
    });
  });
}

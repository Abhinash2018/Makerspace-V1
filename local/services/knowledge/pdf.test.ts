import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { syntheticPdf } from '../../tests/pdf-fixture.ts';
import { extractPdf } from './pdf.ts';

it('extracts synthetic page-associated text through a bounded native worker without inventing empty-page content', async () => {
  const result = await extractPdf(syntheticPdf(['Synthetic workshop hours: nine to six.\nContact the synthetic desk.', '', 'Synthetic tools require staff training.']));
  expect(result.pageCount).toBe(3); expect(result.emptyPages).toEqual([2]);
  expect(result.pages[0]).toEqual({ page: 1, text: 'Synthetic workshop hours: nine to six. Contact the synthetic desk.' });
  expect(result.pages[2]).toEqual({ page: 3, text: 'Synthetic tools require staff training.' });
  expect(Object.isFrozen(result.pages[0])).toBe(true);
});
it('rejects absent/malformed/empty/oversized PDFs with fixed error codes', async () => {
  await expect(extractPdf(Uint8Array.from([1, 2]))).rejects.toMatchObject({ code: 'invalid_pdf' });
  await expect(extractPdf(Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic-private-invalid')))).rejects.toMatchObject({ code: 'parse_failed' });
  await expect(extractPdf(syntheticPdf(['']))).rejects.toMatchObject({ code: 'no_text' });
  await expect(extractPdf(readFileSync(new URL('../../tests/fixtures/encrypted-policy.pdf', import.meta.url)))).rejects.toMatchObject({ code: 'password_required' });
  await expect(extractPdf(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: 'pdf_limits' });
  await expect(extractPdf(syntheticPdf(Array.from({ length: 101 }, () => 'Synthetic page.')))).rejects.toMatchObject({ code: 'pdf_limits' });
});
it('terminates extraction on caller cancellation or its owner deadline', async () => {
  const aborted = new AbortController(); aborted.abort();
  await expect(extractPdf(syntheticPdf(['Synthetic page.']), { signal: aborted.signal })).rejects.toMatchObject({ code: 'cancelled' });
  const active = new AbortController();
  const pending = extractPdf(syntheticPdf(['Synthetic page.']), { signal: active.signal }); active.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await expect(extractPdf(syntheticPdf(['Synthetic page.']), { timeoutMs: 1 })).rejects.toMatchObject({ code: 'timeout' });
});

import { expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { extractOcr } from './ocr.ts';

it('does not launch cancelled OCR and returns a fixed failure for unavailable local input/capability', async () => {
  const cancelled = new AbortController(); cancelled.abort();
  await expect(extractOcr('private-synthetic-path', cancelled.signal)).rejects.toThrow(/^ocr_unavailable$/);
  await expect(extractOcr(join(tmpdir(), `${randomUUID()}.pdf`), new AbortController().signal)).rejects.toThrow(/^ocr_unavailable$/);
});

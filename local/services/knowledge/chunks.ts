import type { PdfPage } from './pdf.ts';

export const chunkerVersion = 'page-v1:1000chars:1200bytes:100overlap';
export type DocumentChunk = Readonly<{ ordinal: number; page: number; text: string }>;
export class ChunkFailure extends Error {
  constructor() { super('Document text cannot be chunked within supported limits.'); }
}
export function chunkPages(pages: readonly PdfPage[]): readonly DocumentChunk[] {
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new ChunkFailure();
  const chunks: DocumentChunk[] = [];
  let total = 0;
  for (const [index, page] of pages.entries()) {
    const source: unknown = page.text;
    if (page.page !== index + 1 || typeof source !== 'string' || source.length > 100000) throw new ChunkFailure();
    total += source.length; if (total > 1000000) throw new ChunkFailure();
    const points = Array.from(source);
    let start = 0;
    while (start < points.length) {
      let end = start, bytes = 0;
      while (end < points.length && end - start < 1000 && bytes + Buffer.byteLength(points[end]!) <= 1200) { bytes += Buffer.byteLength(points[end]!); end++; }
      if (end < points.length) {
        const minimum = start + Math.floor((end - start) * 0.6);
        for (let boundary = end - 1; boundary > minimum; boundary--) { if (points[boundary] === ' ') { end = boundary; break; } }
      }
      const text = points.slice(start, end).join('').trim();
      if (text) chunks.push(Object.freeze({ ordinal: chunks.length + 1, page: page.page, text }));
      if (chunks.length > 1000) throw new ChunkFailure();
      if (end === points.length) break;
      start = Math.max(start + 1, end - 100);
    }
  }
  if (!chunks.length) throw new ChunkFailure();
  return Object.freeze(chunks);
}

import { expect, it } from 'vitest';
import { chunkPages, ChunkFailure } from './chunks.ts';

it('preserves every page and word deterministically within chunk byte/character bounds', () => {
  const words = Array.from({ length: 600 }, (_value, index) => `synthetic${index}`);
  const pages = [{ page: 1, text: words.join(' ') }, { page: 2, text: '' }, { page: 3, text: 'Different synthetic page.' }];
  const chunks = chunkPages(pages);
  expect(chunkPages(pages)).toEqual(chunks);
  expect(chunks.at(-1)).toMatchObject({ page: 3, text: 'Different synthetic page.' });
  expect(chunks.some(chunk => chunk.page === 2)).toBe(false);
  const first = chunks.filter(chunk => chunk.page === 1).map(chunk => chunk.text).join(' ');
  for (const word of words) expect(first).toContain(word);
  for (const [index, chunk] of chunks.entries()) { expect(chunk.ordinal).toBe(index + 1); expect([...chunk.text].length).toBeLessThanOrEqual(1000); expect(Buffer.byteLength(chunk.text)).toBeLessThanOrEqual(1200); }
  expect(Object.isFrozen(chunks)).toBe(true);
});
it('keeps Unicode code points intact and rejects empty/invalid/excessive extraction', () => {
  const chunks = chunkPages([{ page: 1, text: '😀'.repeat(1200) }]);
  for (const chunk of chunks) { expect(chunk.text).not.toMatch(/\p{Cs}/u); expect(Buffer.byteLength(chunk.text)).toBeLessThanOrEqual(1200); }
  expect(() => chunkPages([])).toThrow(ChunkFailure);
  expect(() => chunkPages([{ page: 1, text: '' }])).toThrow(ChunkFailure);
  expect(() => chunkPages([{ page: 2, text: 'Invalid provenance.' }])).toThrow(ChunkFailure);
  expect(() => chunkPages([{ page: 1, text: 'x'.repeat(100001) }])).toThrow(ChunkFailure);
});

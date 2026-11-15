import { expect, it } from 'vitest';
import { rankEvidence } from './retrieval.ts';
import { validateQuotes } from './answers.ts';
import { quoteSelectionSchema } from './chat.ts';
import type { EvidenceChunk } from './repository.ts';

export const syntheticEvidence: readonly EvidenceChunk[] = [
  { chunkId: 'a'.repeat(64), document: { key: 'policy', title: 'Synthetic policy', version: 1, sourceHash: 'b'.repeat(64), pageCount: 2, emptyPages: [], importedAt: '2026-11-14T00:00:00.000Z', parserVersion: 'pdfjs-6.5.438' }, ordinal: 1, page: 1, text: 'Synthetic tools require staff training before use. Training does not grant unsupervised access.', vector: [1, 0] },
  { chunkId: 'c'.repeat(64), document: { key: 'hours', title: 'Synthetic hours', version: 2, sourceHash: 'd'.repeat(64), pageCount: 2, emptyPages: [], importedAt: '2026-11-14T00:00:00.000Z', parserVersion: 'pdfjs-6.5.438' }, ordinal: 1, page: 2, text: 'Synthetic workshop hours are nine to six.', vector: [0, 1] },
];
it('requires lexical overlap and similarity, bounds retrieval, and constructs citations solely from retrieved metadata', () => {
  expect(rankEvidence('What training is required for tools?', [1, 0], syntheticEvidence)).toEqual([syntheticEvidence[0]]);
  expect(rankEvidence('What is the WiFi password?', [1, 0], syntheticEvidence)).toEqual([]);
  expect(rankEvidence('Workshop hours?', [1, 0], syntheticEvidence)).toEqual([]);
  const result = validateQuotes('What training is required?', { quotes: [{ source: 'S1', text: syntheticEvidence[0]!.text }] }, syntheticEvidence);
  expect(result).toMatchObject({ status: 'answered', excerpts: [{ citation: { chunkId: 'a'.repeat(64), documentKey: 'policy', version: 1, page: 1, title: 'Synthetic policy' } }] });
});
it('requires an explicit amount for the same subject on quantity questions, rather than unrelated opening hours', () => {
  const question = 'How many hours of training are required?';
  expect(validateQuotes(question, { quotes: [{ source: 'S1', text: syntheticEvidence[0]!.text }] }, syntheticEvidence).status).toBe('uncertain');
  expect(validateQuotes(question, { quotes: [{ source: 'S2', text: syntheticEvidence[1]!.text }] }, syntheticEvidence).status).toBe('uncertain');
  const text = 'Synthetic training requires two hours.';
  expect(validateQuotes(question, { quotes: [{ source: 'S1', text }] }, [{ ...syntheticEvidence[0]!, text }]).status).toBe('answered');
});
it('refers to staff on forged sources, invented/irrelevant quotes, duplicate references or untrusted citation fields', () => {
  for (const quotes of [[], [{ source: 'S4', text: syntheticEvidence[0]!.text }], [{ source: 'S1', text: 'Training permits unsupervised tool use.' }], [{ source: 'S2', text: syntheticEvidence[1]!.text }], [{ source: 'S1', text: syntheticEvidence[0]!.text }, { source: 'S1', text: syntheticEvidence[0]!.text }]]) {
    const parsed = quoteSelectionSchema.parse({ quotes });
    expect(validateQuotes('Training?', parsed, syntheticEvidence).status).toBe('uncertain');
  }
  expect(quoteSelectionSchema.safeParse({ quotes: [{ source: 'S1', text: syntheticEvidence[0]!.text, page: 9, url: 'https://evil.invalid' }] }).success).toBe(false);
  expect(quoteSelectionSchema.safeParse({ quotes: [{ source: 'S1', text: 'x'.repeat(481) }] }).success).toBe(false);
  expect(validateQuotes('Training?', { quotes: [{ source: 'S1', text: 'training before use.' }] }, syntheticEvidence).status).toBe('uncertain');
});

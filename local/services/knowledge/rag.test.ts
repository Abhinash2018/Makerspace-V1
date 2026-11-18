import { expect, it } from 'vitest';
import { rankChatEvidence, retrievalQuestion, validateGeneration } from './rag.ts';
import type { EvidenceChunk } from './repository.ts';

const chunk = (key: string, page: number, text: string, vector = [1, 0]): EvidenceChunk => ({ chunkId: key.padEnd(64, 'a'), ordinal: page, page, text, vector,
  document: { key, version: 1, title: `Policy ${key}`, sourceHash: 'b'.repeat(64), pageCount: 10, emptyPages: [], importedAt: 'synthetic', parserVersion: 'pdfjs-6.5.438' } });
it('supports semantic paraphrases without lexical overlap and bounds source/page concentration', () => {
  const chunks = Array.from({ length: 8 }, (_, index) => chunk('a', index + 1, 'Synthetic workshop induction.'));
  chunks.push(chunk('b', 1, 'Synthetic device safety.'), chunk('b', 1, 'Duplicate page.'), chunk('c', 1, 'Irrelevant', [0, 1]));
  const result = rankChatEvidence('How do I get 3D printer access?', [1, 0], chunks);
  expect(result.length).toBe(4); expect(result.filter(item => item.document.key === 'a')).toHaveLength(3);
  expect(result.some(item => item.document.key === 'b')).toBe(true); expect(result.some(item => item.document.key === 'c')).toBe(false);
});
it('uses recent user questions for retrieval but never treats assistant claims as evidence', () => {
  const query = retrievalQuestion({ question: 'Which training?', history: [{ role: 'user', content: 'How do I access a 3D printer?' }, { role: 'assistant', content: 'Untrusted invented password' }] });
  expect(query).toContain('3D printer'); expect(query).not.toContain('password');
  expect(Buffer.byteLength(retrievalQuestion({ question: '漢'.repeat(500), history: [] }))).toBeLessThanOrEqual(1300);
});
it('allows generated explanations, attaches original passages and rejects nonexistent or duplicate aliases', () => {
  const evidence = [chunk('a', 2, 'Synthetic printers require staff training before use.')];
  const answer = 'First, finish the required staff training.';
  const result = validateGeneration({ answer, sources: ['S1'] }, evidence);
  expect(result).toMatchObject({ status: 'answered', sections: [{ text: answer, sources: [{ quote: evidence[0]!.text, citation: { title: 'Policy a', page: 2 } }] }] });
  const badSources: ('S1' | 'S4')[][] = [['S4'], ['S1', 'S1']];
  for (const sources of badSources) {
    expect(validateGeneration({ answer, sources }, evidence).status).toBe('uncertain');
  }
  expect(validateGeneration({ answer: '', sources: [] }, evidence).status).toBe('uncertain');
  expect(validateGeneration({ answer: 'You may print if', sources: ['S1'] }, evidence).status).toBe('uncertain');
  expect(validateGeneration({ answer: 'See S1 on page 99.', sources: ['S1'] }, evidence).status).toBe('uncertain');
  expect(validateGeneration({ answer: 'Finish staff training first. See S1 on page 99.', sources: ['S1'] }, evidence)).toMatchObject({ status: 'answered', sections: [{ text: 'Finish staff training first.' }] });
});

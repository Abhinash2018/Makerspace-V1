import { expect, it } from 'vitest';
import { parseKnowledgeArguments } from './command.ts';

it('accepts only explicit bounded operator commands and rejects ambiguity/duplicates', () => {
  expect(parseKnowledgeArguments(['ingest', '--approved', '--key', 'policy', '--title', 'Synthetic', '--file', 'synthetic.pdf'])).toMatchObject({ command: 'ingest', values: { approved: true, key: 'policy' } });
  expect(parseKnowledgeArguments(['status'])).toEqual({ command: 'status', values: {} });
  expect(parseKnowledgeArguments(['ingest', '--approved', '--ocr', '--key', 'manual', '--title', 'Scanned synthetic', '--file', 'synthetic.pdf']).values.ocr).toBe(true);
  expect(parseKnowledgeArguments(['retire', '--approved', '--key', 'synthetic-guide'])).toEqual({ command: 'retire', values: { approved: true, key: 'synthetic-guide' } });
  for (const args of [['status', '--ocr'], ['retire'], ['retire', '--key', 'x', '--ocr'], ['ingest', '--ocr', '--ocr']]) expect(() => parseKnowledgeArguments(args)).toThrow('usage');
  for (const args of [[], ['pull'], ['status', '--file', 'x'], ['configure'], ['configure', '--model', 'x', '--model', 'y'], ['ingest', '--approved'], ['ingest', '--key', '--file'], ['configure', '--url', 'http://remote']]) expect(() => parseKnowledgeArguments(args)).toThrow('usage');
});

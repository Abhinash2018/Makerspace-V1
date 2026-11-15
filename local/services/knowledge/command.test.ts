import { expect, it } from 'vitest';
import { parseKnowledgeArguments } from './command.ts';

it('accepts only explicit bounded operator commands and rejects ambiguity/duplicates', () => {
  expect(parseKnowledgeArguments(['ingest', '--approved', '--key', 'policy', '--title', 'Synthetic', '--file', 'synthetic.pdf'])).toMatchObject({ command: 'ingest', values: { approved: true, key: 'policy' } });
  expect(parseKnowledgeArguments(['status'])).toEqual({ command: 'status', values: {} });
  for (const args of [[], ['pull'], ['status', '--file', 'x'], ['configure'], ['configure', '--model', 'x', '--model', 'y'], ['ingest', '--approved'], ['ingest', '--key', '--file'], ['configure', '--url', 'http://remote']]) expect(() => parseKnowledgeArguments(args)).toThrow('usage');
});

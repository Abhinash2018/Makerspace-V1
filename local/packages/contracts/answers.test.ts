import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { answerDisclaimer, answerResponseSchema, questionSchema } from './answers.ts';

it('normalizes bounded questions, rejects identity/tool/config extras and disallows unsafe output shapes', () => {
  expect(questionSchema.parse({ question: '  What   training is needed?  ' })).toEqual({ question: 'What training is needed?' });
  for (const question of ['', ' ', 'x'.repeat(501), 'a\nquestion', '\u0000', '\ud800']) expect(questionSchema.safeParse({ question }).success).toBe(false);
  for (const key of ['name', 'netId', 'model', 'url', 'sessionScope', 'tools']) expect(questionSchema.safeParse({ question: 'Training?', [key]: 'forged' }).success).toBe(false);
  expect(answerResponseSchema.parse({ requestId: randomUUID(), status: 'uncertain', reason: 'no_evidence', excerpts: [], disclaimer: answerDisclaimer }).status).toBe('uncertain');
  expect(answerResponseSchema.safeParse({ requestId: randomUUID(), status: 'answered', excerpts: [], disclaimer: answerDisclaimer }).success).toBe(false);
  expect(answerResponseSchema.safeParse({ requestId: randomUUID(), status: 'uncertain', reason: 'no_evidence', excerpts: [], disclaimer: answerDisclaimer, html: '<script>' }).success).toBe(false);
});

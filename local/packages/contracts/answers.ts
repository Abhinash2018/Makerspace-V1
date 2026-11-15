import { z } from 'zod';
import { requestIdSchema } from './index.ts';

export const answerDisclaimer = 'Approved document excerpts do not authorize equipment use or replace required staff training.';
export const questionSchema = z.strictObject({ question: z.string().max(1000)
  .refine(value => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))
  .transform(value => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(500).refine(value => new TextEncoder().encode(value).length <= 2000)),
});
export const citationSchema = z.strictObject({
  chunkId: z.string().regex(/^[a-f0-9]{64}$/), documentKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  version: z.number().int().min(1).max(10), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().min(1).max(160), page: z.number().int().min(1).max(100),
});
const common = { requestId: requestIdSchema, disclaimer: z.literal(answerDisclaimer) };
export const answerResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...common, status: z.literal('answered'), excerpts: z.array(z.strictObject({ text: z.string().min(15).max(480), citation: citationSchema })).min(1).max(2) }),
  z.strictObject({ ...common, status: z.literal('uncertain'), reason: z.enum(['no_evidence', 'unsupported_output', 'index_unavailable']), excerpts: z.array(z.never()).max(0) }),
]);
export type AnswerResponse = z.infer<typeof answerResponseSchema>;
export type Question = z.infer<typeof questionSchema>;

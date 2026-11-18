import { z } from 'zod';
import { questionSchema, citationSchema } from './answers.ts';
import { requestIdSchema } from './index.ts';

const text = z.string().min(1).max(3000).refine(value => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value.replace(/[\n\r\t]/g, '')));
export const chatHistorySchema = z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: text })).max(6)
  .refine(items => items.length % 2 === 0 && items.every((item, index) => item.role === (index % 2 ? 'assistant' : 'user')))
  .refine(items => items.every(item => item.role !== 'user' || (item.content.length <= 500 && new TextEncoder().encode(item.content).length <= 2000)))
  .refine(items => items.reduce((sum, item) => sum + new TextEncoder().encode(item.content).length, 0) <= 10000);
export const chatRequestSchema = z.strictObject({ question: z.string().max(1000).transform(value => value.replace(/[\n\r\t]/g, ' ')).pipe(questionSchema.shape.question), history: chatHistorySchema.default([]) });
export const chatDisclaimer = 'Answers use the supplied PDFs. Check the cited pages and follow required staff training.';
const section = z.strictObject({ text: text, sources: z.array(z.strictObject({ quote: z.string().min(1).max(1200), citation: citationSchema })).min(1).max(4) });
export const chatResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ requestId: requestIdSchema, status: z.literal('answered'), sections: z.array(section).min(1).max(4)
    .refine(items => items.reduce((sum, item) => sum + item.text.length, 0) <= 3000), disclaimer: z.literal(chatDisclaimer) }),
  z.strictObject({ requestId: requestIdSchema, status: z.literal('uncertain'), reason: z.enum(['no_evidence', 'unsupported_output', 'index_unavailable']),
    sections: z.array(z.never()).max(0), disclaimer: z.literal(chatDisclaimer) }),
]);
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

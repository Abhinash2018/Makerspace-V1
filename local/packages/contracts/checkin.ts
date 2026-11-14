import { z } from 'zod';
import { requestIdSchema } from './index.ts';

export const displayNameSchema = z.string().max(256)
  .refine(value => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))
  .transform(value => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(100));
export const netIdSchema = z.string().max(64).transform(value => value.trim().toLowerCase())
  .pipe(z.string().regex(/^[a-z][a-z0-9]{1,31}$/));
export const checkinRequestSchema = z.strictObject({
  name: displayNameSchema, netId: netIdSchema,
  idempotencyKey: z.uuid().transform(value => value.toLowerCase()),
});
export const internalVisitRequestSchema = checkinRequestSchema.extend({ sessionScope: z.string().regex(/^[a-f0-9]{64}$/) });
export const checkinResponseSchema = z.strictObject({
  requestId: requestIdSchema, visitId: z.uuid(), recordedAt: z.iso.datetime(),
  selfReported: z.literal(true), replayed: z.boolean(),
});
export type CheckinRequest = z.infer<typeof checkinRequestSchema>;
export type InternalVisitRequest = z.infer<typeof internalVisitRequestSchema>;
export type CheckinResponse = z.infer<typeof checkinResponseSchema>;

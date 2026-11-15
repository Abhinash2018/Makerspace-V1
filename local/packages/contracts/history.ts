import { z } from 'zod';
import { requestIdSchema } from './index.ts';
import { displayNameSchema, netIdSchema } from './checkin.ts';

export const calendarDateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const dateFields = { from: calendarDateSchema.optional(), to: calendarDateSchema.optional() };
const opaqueCursor = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
function validRange(value: { from?: string | undefined; to?: string | undefined }) {
  if (value.from === undefined && value.to === undefined) return true;
  if (!value.from || !value.to) return false;
  const days = (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86400000;
  return days >= 0 && days < 30;
}
export const historyFilterSchema = z.strictObject(dateFields).refine(validRange);
export const historyQuerySchema = z.strictObject({ ...dateFields,
  limit: z.string().regex(/^[1-9]\d?$/).optional().transform(value => Number(value ?? '25')).pipe(z.number().int().min(1).max(50)),
  cursor: opaqueCursor.optional(),
}).refine(validRange);
export const historyRecordSchema = z.strictObject({ visitId: z.uuid(), name: displayNameSchema, netId: netIdSchema, recordedAt: z.iso.datetime(), selfReported: z.literal(true), photoAvailable: z.boolean().optional() });
export const historyResponseSchema = z.strictObject({ requestId: requestIdSchema, items: z.array(historyRecordSchema).max(50),
  nextCursor: opaqueCursor.nullable(), snapshotAt: z.iso.datetime(), timeZone: z.literal('America/Chicago'), retentionDays: z.literal(30),
  from: calendarDateSchema.nullable(), to: calendarDateSchema.nullable(),
});
export const historyExportSchema = z.strictObject({ requestId: requestIdSchema, csv: z.string().min(1).max(262144).refine(value => new TextEncoder().encode(value).length <= 262144), rowCount: z.number().int().min(0).max(500), snapshotAt: z.iso.datetime() });
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export type HistoryRecord = z.infer<typeof historyRecordSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

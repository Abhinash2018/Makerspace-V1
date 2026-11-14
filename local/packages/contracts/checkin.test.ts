import { expect, it } from 'vitest';
import { checkinRequestSchema, checkinResponseSchema, internalVisitRequestSchema } from './checkin.ts';

const idempotencyKey = '0464accc-6eed-44ce-a064-d38f29dcba93';
const valid = { name: '  Jose\u0301   O’Neil  ', netId: '  AB123  ', idempotencyKey: idempotencyKey.toUpperCase() };
it('normalizes bounded self-reported names, NetIDs and UUIDs without claiming institutional identity', () => {
  expect(checkinRequestSchema.parse(valid)).toEqual({ name: 'José O’Neil', netId: 'ab123', idempotencyKey });
  for (const name of ['李 小明', "O'Neil", 'علي', 'Synthetic Visitor']) expect(checkinRequestSchema.safeParse({ ...valid, name }).success).toBe(true);
  expect(internalVisitRequestSchema.parse({ ...valid, sessionScope: 'b'.repeat(64) }).sessionScope).toBe('b'.repeat(64));
});
it('rejects controls, invalid/oversized values and caller-supplied scope or role', () => {
  for (const name of ['', '   ', 'x'.repeat(101), 'x'.repeat(257), 'a\nb', 'a\0b', 'a\u202eb', '\ud800']) expect(checkinRequestSchema.safeParse({ ...valid, name }).success).toBe(false);
  for (const netId of ['', 'a', '1abc', 'ab cd', 'ab@example.edu', 'ab-cd', 'a'.repeat(33)]) expect(checkinRequestSchema.safeParse({ ...valid, netId }).success).toBe(false);
  for (const extra of [{ sessionScope: 'b'.repeat(64) }, { role: 'staff' }, { selfReported: false }, { photo: 'private' }]) expect(checkinRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  expect(checkinRequestSchema.safeParse({ ...valid, idempotencyKey: 'predictable' }).success).toBe(false);
  expect(internalVisitRequestSchema.safeParse({ ...valid, sessionScope: 'bad' }).success).toBe(false);
});
it('bounds confirmations and never returns submitted identity or unverified status', () => {
  const response = { requestId: idempotencyKey, visitId: idempotencyKey, recordedAt: '2026-11-13T20:00:00.000Z', selfReported: true, replayed: false };
  expect(checkinResponseSchema.parse(response)).toEqual(response);
  for (const extra of [{ name: 'private' }, { netId: 'private' }, { sessionScope: 'private' }]) expect(checkinResponseSchema.safeParse({ ...response, ...extra }).success).toBe(false);
  expect(checkinResponseSchema.safeParse({ ...response, selfReported: false }).success).toBe(false);
  expect(checkinResponseSchema.safeParse({ ...response, recordedAt: 'yesterday' }).success).toBe(false);
});

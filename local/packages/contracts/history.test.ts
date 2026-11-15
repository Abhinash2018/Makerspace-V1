import { expect, it } from 'vitest';
import { calendarDateSchema, historyFilterSchema, historyQuerySchema } from './history.ts';

it('accepts real bounded Chicago date filters and strict bounded keyset queries', () => {
  expect(historyQuerySchema.parse({})).toEqual({ limit: 25 });
  expect(historyQuerySchema.parse({ from: '2026-11-01', to: '2026-11-14', limit: '50' })).toMatchObject({ limit: 50 });
  expect(calendarDateSchema.safeParse('2028-02-29').success).toBe(true);
  for (const date of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-1', '2100-01-01']) expect(calendarDateSchema.safeParse(date).success).toBe(false);
  for (const value of [{ from: '2026-11-01' }, { to: '2026-11-14' }, { from: '2026-11-14', to: '2026-11-01' }, { from: '2026-10-01', to: '2026-11-01' }, { name: 'forged' }, { limit: '51' }, { limit: '0' }, { limit: '01' }, { limit: ['1', '2'] }, { cursor: 'forged' }]) expect(historyQuerySchema.safeParse(value).success).toBe(false);
  expect(historyFilterSchema.safeParse({ cursor: 'forged' }).success).toBe(false);
  expect(historyFilterSchema.parse({})).toEqual({});
  expect(historyQuerySchema.parse({ photos: '1' }).photos).toBe('1');
  expect(historyQuerySchema.safeParse({ photos: 'true' }).success).toBe(false);
  expect(historyFilterSchema.safeParse({ photos: '1' }).success).toBe(false);
});

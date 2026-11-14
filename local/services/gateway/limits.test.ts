import { expect, it } from 'vitest';
import { createLimit } from './limits.ts';

it('bounds attempts in constant memory and resets only at the fixed deadline', () => {
  let at = 0;
  const allow = createLimit(5, 60_000, () => at);
  for (let i = 0; i < 5; i++) expect(allow().allowed).toBe(true);
  expect(allow()).toEqual({ allowed: false, retryAfterSeconds: 60 });
  at = 59999;
  expect(allow()).toEqual({ allowed: false, retryAfterSeconds: 1 });
  at = 60000;
  expect(allow().allowed).toBe(true);
  at = 300000;
  expect(allow().allowed).toBe(true);
  expect(() => createLimit(0, 1)).toThrow();
  expect(() => createLimit(1, Infinity)).toThrow();
});

import { expect, it } from 'vitest';
import { createSessionStore, SessionCapacityError } from './sessions.ts';

it('issues independent opaque session/CSRF tokens and returns immutable role snapshots', () => {
  const store = createSessionStore(() => 0);
  const kiosk = store.create('kiosk'), staff = store.create('staff');
  const values = [kiosk.token, kiosk.session.csrfToken, staff.token, staff.session.csrfToken];
  expect(new Set(values).size).toBe(4);
  for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(kiosk.session).toEqual({ role: 'kiosk', csrfToken: kiosk.session.csrfToken, idleExpiresInMs: 120_000, absoluteExpiresInMs: 1_800_000 });
  expect(staff.session).toEqual({ role: 'staff', csrfToken: staff.session.csrfToken, idleExpiresInMs: 900_000, absoluteExpiresInMs: 28_800_000 });
  expect(store.get(staff.token)).toEqual(staff.session);
  expect(store.get(staff.token)).not.toBe(staff.session);
  expect(Object.isFrozen(kiosk)).toBe(true);
  expect(Object.isFrozen(store.get(staff.token))).toBe(true);
  expect(store.verifyCsrf(kiosk.token, kiosk.session.csrfToken)).toBe(true);
  expect(store.verifyCsrf(staff.token, kiosk.session.csrfToken)).toBe(false);
  expect(store.verifyCsrf(staff.token, staff.token)).toBe(false);
  expect(store.get(staff.session.csrfToken)).toBeUndefined();
});

it('fails closed for malformed/unknown tokens without throwing or accepting CSRF as a session', () => {
  const store = createSessionStore();
  const { token, session } = store.create('staff');
  for (const invalid of [undefined, null, true, 1, {}, [], '', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43), 'a'.repeat(100_000), '☃'.repeat(43)]) {
    expect(store.get(invalid)).toBeUndefined();
    expect(store.touch(invalid)).toBe(false);
    expect(store.rotate(invalid, 'staff')).toBeUndefined();
    expect(store.verifyCsrf(invalid, session.csrfToken)).toBe(false);
    expect(store.verifyCsrf(token, invalid)).toBe(false);
    expect(() => store.revoke(invalid)).not.toThrow();
  }
  expect(store.get('z'.repeat(43))).toBeUndefined();
  expect(store.verifyCsrf('z'.repeat(43), session.csrfToken)).toBe(false);
  expect(store.verifyCsrf(token, 'z'.repeat(43))).toBe(false);
  expect(store.get(token)?.role).toBe('staff');
});

it.each([
  { role: 'kiosk' as const, idleMs: 120_000 },
  { role: 'staff' as const, idleMs: 900_000 },
])('expires $role at its idle deadline despite polling and CSRF checks', ({ role, idleMs }) => {
  let at = 0;
  const store = createSessionStore(() => at);
  const { token, session } = store.create(role);
  at = idleMs - 1;
  expect(store.get(token)?.idleExpiresInMs).toBe(1);
  expect(store.verifyCsrf(token, session.csrfToken)).toBe(true);
  at = idleMs;
  expect(store.get(token)).toBeUndefined();
  expect(store.touch(token)).toBe(false);
  expect(store.verifyCsrf(token, session.csrfToken)).toBe(false);
  expect(store.rotate(token, 'staff')).toBeUndefined();
});

it.each([
  { role: 'kiosk' as const, idleMs: 120_000, absoluteMs: 1_800_000 },
  { role: 'staff' as const, idleMs: 900_000, absoluteMs: 28_800_000 },
])('refreshes activity without extending the $role absolute deadline', ({ role, idleMs, absoluteMs }) => {
  let at = 0;
  const store = createSessionStore(() => at);
  const { token } = store.create(role);
  for (at = idleMs / 2; at < absoluteMs; at += idleMs / 2) expect(store.touch(token)).toBe(true);
  at = absoluteMs - 1;
  expect(store.get(token)?.idleExpiresInMs).toBe(1);
  expect(store.get(token)?.absoluteExpiresInMs).toBe(1);
  expect(store.touch(token)).toBe(true);
  at = absoluteMs;
  expect(store.touch(token)).toBe(false);
  expect(store.get(token)).toBeUndefined();
});

it('rotates session and CSRF together, invalidates the previous role and revokes on logout/restart', () => {
  const store = createSessionStore();
  const kiosk = store.create('kiosk');
  const staff = store.rotate(kiosk.token, 'staff')!;
  expect(staff.token).not.toBe(kiosk.token);
  expect(staff.session.csrfToken).not.toBe(kiosk.session.csrfToken);
  expect(store.get(kiosk.token)).toBeUndefined();
  expect(store.verifyCsrf(kiosk.token, kiosk.session.csrfToken)).toBe(false);
  expect(store.get(staff.token)?.role).toBe('staff');
  expect(store.verifyCsrf(staff.token, kiosk.session.csrfToken)).toBe(false);
  expect(store.verifyCsrf(staff.token, staff.session.csrfToken)).toBe(true);
  expect(createSessionStore().get(staff.token)).toBeUndefined();
  store.revoke(staff.token); store.revoke(staff.token);
  expect(store.get(staff.token)).toBeUndefined();
  const next = store.create('kiosk');
  store.clear();
  expect(store.get(next.token)).toBeUndefined();
});

it('bounds each role separately, preserves active sessions at capacity and can rotate a full role', () => {
  const store = createSessionStore(() => 0);
  const staff = Array.from({ length: 16 }, () => store.create('staff'));
  const kiosk = Array.from({ length: 128 }, () => store.create('kiosk'));
  expect(() => store.create('staff')).toThrow(SessionCapacityError);
  expect(() => store.create('kiosk')).toThrow(SessionCapacityError);
  expect(() => store.rotate(kiosk[0]!.token, 'staff')).toThrow(SessionCapacityError);
  for (const session of [...staff, ...kiosk]) expect(store.get(session.token)?.role).toBe(session.session.role);
  const rotated = store.rotate(staff[0]!.token, 'staff')!;
  expect(store.get(staff[0]!.token)).toBeUndefined();
  expect(store.get(rotated.token)?.role).toBe('staff');
  expect(() => store.create('staff')).toThrow(SessionCapacityError);
  store.revoke(staff[1]!.token);
  const elevated = store.rotate(kiosk[0]!.token, 'staff')!;
  expect(store.get(elevated.token)?.role).toBe('staff');
  expect(store.get(kiosk[0]!.token)).toBeUndefined();
  expect(store.create('kiosk').session.role).toBe('kiosk');
});

it('reclaims expired capacity without requiring a read of each old token', () => {
  let at = 0;
  const store = createSessionStore(() => at);
  const kiosk = Array.from({ length: 128 }, () => store.create('kiosk'));
  const staff = store.create('staff');
  at = 120_000;
  const next = store.create('kiosk');
  expect(store.get(next.token)?.role).toBe('kiosk');
  expect(store.get(staff.token)?.role).toBe('staff');
  for (const previous of kiosk) expect(store.get(previous.token)).toBeUndefined();
});

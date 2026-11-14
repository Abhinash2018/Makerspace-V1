import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { makeServer } from '../../packages/http/server.ts';
import { errorSchema, sessionResponseSchema } from '../../packages/contracts/index.ts';
import { registerAuth } from './auth.ts';
import { provisionStaff } from './credentials.ts';

const root = mkdtempSync(path.join(tmpdir(), 'ms001-auth-'));
const password = 'synthetic staff passphrase 001';
const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' };
beforeAll(async () => { await provisionStaff(root, password); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });
function fixture(directory = root) {
  let at = 0;
  const app = makeServer({ service: 'gateway', port: 3000, origins: [headers.origin], logLevel: 'silent' });
  const auth = registerAuth(app, { directory, origins: [headers.origin], now: () => at });
  // Test-only capability: production must not add a fake staff feature.
  app.post('/api/v1/staff/test-only', (req, reply) => {
    if (!auth.authorize(req, reply, 'staff')) return reply;
    return { accepted: true, forged: Object.keys(req.headers).filter(name => name.startsWith('x-user-') || name.startsWith('x-internal-') || name.startsWith('x-staff-') || name === 'x-role') };
  });
  const bootstrap = async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-kiosk-bootstrap': '1' }, payload: {} });
    expect(response.statusCode).toBe(200);
    return { cookie: String(response.headers['set-cookie']).split(';')[0]!, csrf: response.json().csrfToken as string, response };
  };
  const login = async (browser: { cookie: string; csrf: string }, value: Record<string, unknown> = { password }) => app.inject({ method: 'POST', url: '/api/v1/staff/login', headers: { ...headers, cookie: browser.cookie, 'x-csrf-token': browser.csrf }, payload: value });
  return { app, auth, bootstrap, login, advance: (ms: number) => { at += ms; } };
}

it('rotates after verified login, protects staff roles, strips forged context and revokes on logout/close', async () => {
  const f = fixture();
  try {
    const kiosk = await f.bootstrap();
    expect(sessionResponseSchema.safeParse(kiosk.response.json()).success).toBe(true);
    expect(kiosk.response.headers['set-cookie']).toMatch(/Path=\/; HttpOnly; SameSite=Strict; Max-Age=1800/);
    expect(kiosk.response.body).not.toContain(kiosk.cookie.split('=')[1]);
    const protectedRequest = (cookie: string, csrf: string) => f.app.inject({ method: 'POST', url: '/api/v1/staff/test-only', headers: { ...headers, cookie, 'x-csrf-token': csrf, 'x-user-id': 'forged', 'x-internal-service-token': 'forged', 'x-staff-role': 'staff', 'x-role': 'staff' }, payload: {} });
    expect((await protectedRequest(kiosk.cookie, kiosk.csrf)).statusCode).toBe(403);
    const loggedIn = await f.login(kiosk);
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().role).toBe('staff');
    const staffCookie = String(loggedIn.headers['set-cookie']).split(';')[0]!;
    expect(staffCookie).not.toBe(kiosk.cookie);
    expect(loggedIn.json().csrfToken).not.toBe(kiosk.csrf);
    expect((await protectedRequest(kiosk.cookie, kiosk.csrf)).statusCode).toBe(401);
    expect((await protectedRequest(staffCookie, kiosk.csrf)).statusCode).toBe(403);
    expect((await protectedRequest(staffCookie, loggedIn.json().csrfToken)).json()).toEqual({ accepted: true, forged: [] });
    const logout = await f.app.inject({ method: 'POST', url: '/api/v1/staff/logout', headers: { ...headers, cookie: staffCookie, 'x-csrf-token': loggedIn.json().csrfToken }, payload: {} });
    expect(logout.statusCode).toBe(200); expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect((await protectedRequest(staffCookie, loggedIn.json().csrfToken)).statusCode).toBe(401);
    const next = await f.bootstrap(); await f.app.close();
    expect(f.auth.sessions.get(next.cookie.split('=')[1])).toBeUndefined();
  } finally { await f.app.close(); }
});

it('rejects hostile/missing browser context, invalid bodies and ambiguous cookies before mutations', async () => {
  const f = fixture();
  try {
    for (const overrides of [{ origin: undefined }, { origin: 'null' }, { origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { host: 'evil.invalid' }]) {
      const requestHeaders: Record<string, string> = { ...headers, 'x-kiosk-bootstrap': '1' };
      for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete requestHeaders[key]; else requestHeaders[key] = value; }
      const response = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: requestHeaders, payload: {} });
      expect(response.statusCode).toBe(403); expect(errorSchema.safeParse(response.json()).success).toBe(true);
    }
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/session', headers, payload: {} })).statusCode).toBe(403);
    const kiosk = await f.bootstrap();
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, cookie: kiosk.cookie }, payload: {} })).statusCode).toBe(403);
    expect((await f.login(kiosk, { password, role: 'staff' })).statusCode).toBe(400);
    expect((await f.login(kiosk, { password: 'incorrect synthetic passphrase' })).statusCode).toBe(401);
    expect((await f.app.inject({ url: '/api/v1/session', headers: { ...headers, cookie: `${kiosk.cookie}; ${kiosk.cookie}` } })).statusCode).toBe(400);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-kiosk-bootstrap': '1' }, payload: { role: 'staff' } })).statusCode).toBe(400);
  } finally { await f.app.close(); }
});

it('does not let polling or an in-flight password check revive an expired/reset session', async () => {
  const f = fixture();
  try {
    const kiosk = await f.bootstrap();
    f.advance(119999);
    expect((await f.app.inject({ url: '/api/v1/session', headers: { ...headers, cookie: kiosk.cookie } })).statusCode).toBe(200);
    f.advance(1);
    expect((await f.app.inject({ url: '/api/v1/session', headers: { ...headers, cookie: kiosk.cookie } })).statusCode).toBe(401);
    const next = await f.bootstrap();
    // Start hashing, then revoke through the store while the async derivation runs.
    const pending = f.login(next);
    await new Promise(resolve => setTimeout(resolve, 20));
    f.auth.sessions.revoke(next.cookie.split('=')[1]);
    expect((await pending).statusCode).toBe(401);
  } finally { await f.app.close(); }
});

it('bounds login/bootstrap/API traffic with Retry-After and fails closed without provisioned credentials', async () => {
  const f = fixture(path.join(root, 'unconfigured'));
  try {
    const kiosk = await f.bootstrap();
    for (let i = 0; i < 5; i++) expect((await f.login(kiosk)).statusCode).toBe(503);
    const limited = await f.login(kiosk);
    expect(limited.statusCode).toBe(429); expect(Number(limited.headers['retry-after'])).toBe(60);
    f.advance(60000);
    expect((await f.login(kiosk)).statusCode).toBe(503);
    for (let i = 0; i < 20; i++) await f.bootstrap();
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-kiosk-bootstrap': '1', 'x-forwarded-for': 'different' }, payload: {} })).statusCode).toBe(429);
    for (let i = 0; i < 240; i++) await f.app.inject({ url: '/api/v1/session', headers: { ...headers, cookie: kiosk.cookie } });
    expect((await f.app.inject({ url: '/api/v1/session', headers })).statusCode).toBe(429);
  } finally { await f.app.close(); }
});

it('reports session capacity without evicting the caller or an active staff session', async () => {
  const f = fixture();
  try {
    const kiosk = await f.bootstrap();
    const staff = Array.from({ length: 16 }, () => f.auth.sessions.create('staff'));
    const denied = await f.login(kiosk);
    expect(denied.statusCode).toBe(503);
    expect(denied.json().error.code).toBe('session_capacity');
    expect(f.auth.sessions.get(kiosk.cookie.split('=')[1])?.role).toBe('kiosk');
    for (const previous of staff) expect(f.auth.sessions.get(previous.token)?.role).toBe('staff');
  } finally { await f.app.close(); }
});

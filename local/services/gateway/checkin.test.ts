import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { makeServer } from '../../packages/http/server.ts';
import { registerAuth } from './auth.ts';
import { registerCheckin } from './checkin.ts';

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms002-gateway-checkin-'));
  const seen: { body: Record<string, unknown>; headers: Record<string, unknown>; url: string }[] = [];
  let mode: 'ok' | 'conflict' | 'invalid' | 'oversized' | 'wrong-id' | 'stall' | 'redirect' = 'ok';
  const backend = createServer((req, res) => {
    let source = ''; req.on('data', chunk => { source += String(chunk); });
    req.on('end', () => {
      seen.push({ body: JSON.parse(source), headers: req.headers, url: req.url! });
      if (mode === 'stall') return;
      if (mode === 'redirect') { res.writeHead(302, { location: '/elsewhere' }); res.end(); return; }
      res.setHeader('content-type', 'application/json');
      if (mode === 'conflict') { res.statusCode = 409; res.end(JSON.stringify({ error: { code: 'idempotency_conflict', message: 'untrusted upstream message', requestId: req.headers['x-request-id'] } })); return; }
      if (mode === 'invalid') { res.end('{'); return; }
      if (mode === 'oversized') { res.end('x'.repeat(5000)); return; }
      res.end(JSON.stringify({ requestId: mode === 'wrong-id' ? randomUUID() : req.headers['x-request-id'], visitId: randomUUID(), recordedAt: '2026-11-13T20:00:00.000Z', selfReported: true, replayed: false }));
    });
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const port = (backend.address() as AddressInfo).port;
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent', ATTENDANCE_PORT: String(port), ATTENDANCE_URL: `http://127.0.0.1:${port}` }, root);
  const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
  const app = makeServer({ service: 'gateway', port: 3000, origins: [headers.origin], logLevel: 'silent' });
  const auth = registerAuth(app, { directory: path.join(root, 'gateway'), origins: [headers.origin] });
  registerCheckin(app, config, auth);
  const bootstrap = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-kiosk-bootstrap': '1' }, payload: {} });
  const browser = { ...headers, cookie: String(bootstrap.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': String(bootstrap.json().csrfToken) };
  const payload = { name: 'Synthetic Gateway Visitor', netId: 'ab123', idempotencyKey: randomUUID() };
  return { app, auth, headers, browser, payload, seen, config,
    setMode: (value: typeof mode) => { mode = value; },
    dispose: async () => { await app.close(); backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); rmSync(root, { recursive: true, force: true }); },
  };
}
it('requires kiosk auth/CSRF, constructs upstream context and preserves only validated receipts/conflicts', async () => {
  const f = await fixture();
  try {
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: f.headers, payload: f.payload })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: { ...f.browser, 'x-csrf-token': 'wrong' }, payload: f.payload })).statusCode).toBe(403);
    const staff = f.auth.sessions.create('staff');
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: { ...f.browser, cookie: `makerspace_session=${staff.token}`, 'x-csrf-token': staff.session.csrfToken }, payload: f.payload })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: f.browser, payload: { ...f.payload, sessionScope: 'b'.repeat(64) } })).statusCode).toBe(400);
    expect(f.seen).toHaveLength(0);
    const result = await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: { ...f.browser, 'x-user-id': 'forged', 'x-internal-service-token': 'forged' }, payload: f.payload });
    expect(result.statusCode).toBe(200);
    expect(result.body).not.toContain(f.payload.name);
    expect(f.seen[0]!.headers['x-internal-service-token']).toBe(f.config.serviceToken);
    expect(f.seen[0]!.headers['x-user-id']).toBeUndefined(); expect(f.seen[0]!.headers['x-csrf-token']).toBeUndefined();
    expect(f.seen[0]!.body.sessionScope).toMatch(/^[a-f0-9]{64}$/);
    expect(f.seen[0]!.body.sessionScope).not.toBe(f.browser['x-csrf-token']);
    expect(f.seen[0]!.url).toBe('/internal/v1/visits');
    f.setMode('conflict');
    const conflict = await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: f.browser, payload: f.payload });
    expect(conflict.statusCode).toBe(409); expect(conflict.body).not.toContain('untrusted'); expect(f.seen).toHaveLength(2);
    const second = f.auth.sessions.create('kiosk'); f.setMode('ok');
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: { ...f.browser, cookie: `makerspace_session=${second.token}`, 'x-csrf-token': second.session.csrfToken }, payload: f.payload })).statusCode).toBe(200);
    expect(f.seen[2]!.body.sessionScope).not.toBe(f.seen[0]!.body.sessionScope);
  } finally { await f.dispose(); }
});
it('fails closed on malformed, mismatched, oversized, redirected and timed-out upstream responses without retries', async () => {
  const f = await fixture();
  try {
    for (const mode of ['invalid', 'oversized', 'wrong-id', 'redirect', 'stall'] as const) {
      f.setMode(mode);
      const before = f.seen.length;
      const result = await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: f.browser, payload: f.payload });
      expect(result.statusCode).toBe(503); expect(result.json().error.code).toBe('attendance_unavailable');
      expect(f.seen).toHaveLength(before + 1);
    }
  } finally { await f.dispose(); }
});
it('bounds authenticated check-in work and does not trust forwarded identities for extra quota', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 10; i++) expect((await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: f.browser, payload: f.payload })).statusCode).toBe(200);
    const denied = await f.app.inject({ method: 'POST', url: '/api/v1/checkin', headers: { ...f.browser, 'x-forwarded-for': 'different' }, payload: f.payload });
    expect(denied.statusCode).toBe(429); expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
    expect(f.seen).toHaveLength(10);
  } finally { await f.dispose(); }
});

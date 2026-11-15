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
import { registerStaffHistory } from './history.ts';

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms005-gateway-'));
  let mode = 'ok', now = 0, received: { url: string; body: unknown; headers: Record<string, unknown> } | undefined;
  let reached: (() => void) | undefined, release: (() => void) | undefined;
  const backend = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      received = { url: req.url!, body: body ? JSON.parse(body) : null, headers: req.headers };
      const respond = () => {
        res.setHeader('content-type', 'application/json');
        if (mode === 'redirect') { res.writeHead(302, { location: 'https://remote.invalid' }); res.end(); return; }
        if (mode === 'huge') { res.end('x'.repeat(65537)); return; }
        if (mode === 'too-large') { res.writeHead(409); res.end(JSON.stringify({ error: { requestId: req.headers['x-request-id'], code: 'export_too_large', message: 'private upstream detail' } })); return; }
        const requestId = mode === 'wrong-id' ? randomUUID() : req.headers['x-request-id'];
        if (req.url?.includes('/export')) { res.end(JSON.stringify({ requestId, csv: '\uFEFF"name"\r\n"Synthetic history visitor"\r\n', rowCount: 1, snapshotAt: new Date().toISOString() })); return; }
        res.end(JSON.stringify({ requestId, items: [{ visitId: randomUUID(), name: 'Synthetic history visitor', netId: 'ab123', recordedAt: new Date().toISOString(), selfReported: true }],
          nextCursor: null, snapshotAt: new Date().toISOString(), timeZone: 'America/Chicago', retentionDays: 30, from: mode === 'wrong-filter' ? '2026-11-14' : null, to: null,
          ...(mode === 'extra' ? { secret: 'forged private data' } : {}),
        }));
      };
      if (mode === 'waiting') { release = respond; reached?.(); } else respond();
    });
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const port = (backend.address() as AddressInfo).port;
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent', ATTENDANCE_PORT: String(port), ATTENDANCE_URL: `http://127.0.0.1:${port}` }, root);
  const base = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
  const app = makeServer({ service: 'gateway', port: 3000, origins: [base.origin], logLevel: 'silent' });
  const auth = registerAuth(app, { directory: path.join(root, 'gateway'), origins: [base.origin], now: () => now });
  registerStaffHistory(app, config, auth);
  const staff = auth.sessions.create('staff');
  const headers = { ...base, cookie: `makerspace_session=${staff.token}`, 'x-csrf-token': staff.session.csrfToken };
  return { app, auth, base, headers, config, received: () => received, mode: (value: string) => { mode = value; }, expire: () => { now = 900000; },
    wait: () => new Promise<void>(resolve => { reached = resolve; }), release: () => release?.(),
    dispose: async () => { backend.closeAllConnections(); await app.close(); await new Promise<void>(resolve => backend.close(() => resolve())); rmSync(root, { recursive: true, force: true }); },
  };
}
it('authorizes only staff, requires export CSRF/Origin, and forwards no browser identity or token', async () => {
  const f = await fixture();
  try {
    expect((await f.app.inject({ url: '/api/v1/staff/visits', headers: { ...f.base, 'x-role': 'staff' } })).statusCode).toBe(401);
    const kiosk = f.auth.sessions.create('kiosk');
    const denied = await f.app.inject({ url: '/api/v1/staff/visits', headers: { ...f.base, cookie: `makerspace_session=${kiosk.token}` } });
    expect(denied.statusCode).toBe(403); expect(denied.body).not.toContain('Synthetic history visitor');
    expect((await f.app.inject({ url: '/api/v1/staff/visits', headers: { ...f.headers, 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
    expect((await f.app.inject({ url: '/api/v1/staff/visits?limit=1&limit=2', headers: f.headers })).statusCode).toBe(400);
    const history = await f.app.inject({ url: '/api/v1/staff/visits?limit=1', headers: { ...f.headers, 'x-user-id': 'forged', 'x-internal-service-token': 'forged' } });
    expect(history.statusCode).toBe(200); expect(history.json().items[0].name).toBe('Synthetic history visitor');
    expect(f.received()).toMatchObject({ url: '/internal/v1/visits?limit=1', body: null, headers: { 'x-internal-service-token': f.config.serviceToken } });
    for (const name of ['cookie', 'x-user-id', 'x-csrf-token']) expect(f.received()!.headers[name]).toBeUndefined();
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: { ...f.headers, 'x-csrf-token': 'wrong' }, payload: {} })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: { ...f.headers, origin: 'https://evil.invalid' }, payload: {} })).statusCode).toBe(403);
    const download = await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: f.headers, payload: {} });
    expect(download.statusCode).toBe(200); expect(download.headers['content-type']).toContain('text/csv'); expect(download.headers['content-disposition']).toBe('attachment; filename="makerspace-visits.csv"'); expect(download.headers['cache-control']).toBe('no-store');
  } finally { await f.dispose(); }
});
it('refuses forged/oversized/redirect/upstream failures and rechecks expired staff before returning rows', async () => {
  const f = await fixture();
  try {
    for (const mode of ['wrong-id', 'wrong-filter', 'extra', 'huge', 'redirect']) {
      f.mode(mode); const result = await f.app.inject({ url: '/api/v1/staff/visits', headers: f.headers }); expect(result.statusCode).toBe(503); expect(result.body).not.toMatch(/Synthetic history visitor|forged private/);
    }
    f.mode('too-large'); const large = await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: f.headers, payload: {} }); expect(large.statusCode).toBe(409); expect(large.json().error.code).toBe('export_too_large'); expect(large.body).not.toContain('private upstream');
    f.mode('waiting'); const waiting = f.wait(), pending = Promise.resolve(f.app.inject({ url: '/api/v1/staff/visits', headers: f.headers }));
    await waiting; f.expire(); f.release(); const expired = await pending; expect(expired.statusCode).toBe(401); expect(expired.body).not.toContain('Synthetic history visitor');
  } finally { await f.dispose(); }
});
it('bounds staff history reads and exports separately', async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 30; index++) expect((await f.app.inject({ url: '/api/v1/staff/visits', headers: f.headers })).statusCode).toBe(200);
    expect((await f.app.inject({ url: '/api/v1/staff/visits', headers: f.headers })).statusCode).toBe(429);
    for (let index = 0; index < 3; index++) expect((await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: f.headers, payload: {} })).statusCode).toBe(200);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/staff/visits/export', headers: f.headers, payload: {} })).statusCode).toBe(429);
  } finally { await f.dispose(); }
});

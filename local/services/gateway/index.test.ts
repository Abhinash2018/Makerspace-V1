import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { createGateway } from './index.ts';

it('serves only built assets, rejects hostile browser context and leaves future APIs absent', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-gateway-'));
  mkdirSync(path.join(root, 'assets')); writeFileSync(path.join(root, 'index.html'), '<h1>Kiosk</h1>');
  writeFileSync(path.join(root, 'assets', 'app-123.js'), 'void 0;'); writeFileSync(path.join(root, '.env'), 'private');
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  const app = createGateway(config, { assetDir: root });
  const headers = { host: '127.0.0.1:3000' };
  try {
    const page = await app.inject({ url: '/', headers });
    expect(page.statusCode).toBe(200); expect(page.headers['permissions-policy']).toContain('camera=()');
    expect(page.headers['content-security-policy']).toContain("connect-src 'self'");
    expect((await app.inject({ url: '/', headers: { host: 'evil.invalid' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/', headers: { ...headers, origin: 'https://evil.invalid' } })).statusCode).toBe(403);
    for (const url of ['/.env', '/assets/../.env', '/api/chat', '/api/v1/checkin', '/internal/v1/model-status']) expect((await app.inject({ url, headers })).statusCode).toBe(404);
    const status = await app.inject({ url: '/api/v1/system/status', headers });
    expect(status.statusCode).toBe(200); expect(status.json().state).toBe('unavailable');
    expect(JSON.stringify(status.json())).not.toContain(config.serviceToken);
    const browser = { ...headers, origin: 'http://127.0.0.1:3000', 'x-kiosk-bootstrap': '1' };
    const session = await app.inject({ method: 'POST', url: '/api/v1/session', headers: browser, payload: {} });
    expect(session.statusCode).toBe(200); expect(session.json().role).toBe('kiosk');
    const login = await app.inject({ method: 'POST', url: '/api/v1/staff/login', headers: { ...browser, cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json().csrfToken }, payload: { password: 'synthetic unavailable password' } });
    expect(login.statusCode).toBe(503);
    expect(login.json().error.code).toBe('auth_unavailable');
    expect((await app.inject({ url: '/health/live', headers })).statusCode).toBe(200);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
}, 15000);

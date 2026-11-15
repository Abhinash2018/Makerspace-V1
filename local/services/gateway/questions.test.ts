import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { makeServer } from '../../packages/http/server.ts';
import { answerDisclaimer } from '../../packages/contracts/answers.ts';
import { registerAuth } from './auth.ts';
import { registerQuestions } from './questions.ts';

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms004-gateway-'));
  let mode = 'answered', now = 0;
  let received: { body: unknown; headers: Record<string, unknown>; url: string } | undefined;
  let release: (() => void) | undefined, started: (() => void) | undefined;
  const backend = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      received = { body: JSON.parse(body), headers: req.headers, url: req.url! };
      const respond = () => {
        res.setHeader('content-type', 'application/json');
        if (mode === 'redirect') { res.writeHead(302, { location: 'https://remote.invalid' }); res.end(); return; }
        if (mode === 'huge') { res.end('x'.repeat(16385)); return; }
        if (mode === 'error') { res.writeHead(503); res.end(JSON.stringify({ error: { requestId: req.headers['x-request-id'], code: 'knowledge_unavailable', message: 'private upstream detail' } })); return; }
        const response = { requestId: mode === 'wrong-id' ? randomUUID() : req.headers['x-request-id'], disclaimer: answerDisclaimer,
          ...(mode === 'uncertain' ? { status: 'uncertain', reason: 'no_evidence', excerpts: [] } : { status: 'answered', excerpts: [{ text: 'Synthetic tools require staff training.', citation: { chunkId: 'a'.repeat(64), documentKey: 'policy', version: 1, sourceHash: 'b'.repeat(64), title: 'Synthetic policy', page: 1 } }] }),
          ...(mode === 'extra' ? { html: '<script>forged</script>' } : {}),
        };
        res.end(JSON.stringify(response));
      };
      if (mode === 'waiting') { release = respond; started?.(); } else respond();
    });
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const port = (backend.address() as AddressInfo).port;
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent', KNOWLEDGE_PORT: String(port), KNOWLEDGE_URL: `http://127.0.0.1:${port}` }, root);
  const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
  const app = makeServer({ service: 'gateway', port: 3000, origins: [headers.origin], logLevel: 'silent' });
  const auth = registerAuth(app, { directory: path.join(root, 'gateway'), origins: [headers.origin], now: () => now });
  registerQuestions(app, config, auth);
  const boot = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { ...headers, 'x-kiosk-bootstrap': '1' }, payload: {} });
  const browser = { ...headers, cookie: String(boot.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': String(boot.json().csrfToken) };
  return { app, auth, browser, headers, config, getReceived: () => received, setMode: (value: string) => { mode = value; }, expire: () => { now = 120000; },
    wait: () => new Promise<void>(resolve => { started = resolve; }), release: () => release?.(),
    dispose: async () => { backend.closeAllConnections(); await app.close(); await new Promise<void>(resolve => backend.close(() => resolve())); rmSync(root, { recursive: true, force: true }); },
  };
}
it('requires kiosk Origin/CSRF and forwards only normalized question and server-owned transport headers', async () => {
  const f = await fixture();
  try {
    const input = { method: 'POST' as const, url: '/api/v1/question', payload: { question: '  Training for tools?  ' } };
    expect((await f.app.inject({ ...input, headers: f.headers })).statusCode).toBe(401);
    expect((await f.app.inject({ ...input, headers: { ...f.browser, 'x-csrf-token': 'wrong' } })).statusCode).toBe(403);
    expect((await f.app.inject({ ...input, headers: { ...f.browser, origin: 'https://evil.invalid' } })).statusCode).toBe(403);
    const staff = f.auth.sessions.create('staff');
    expect((await f.app.inject({ ...input, headers: { ...f.browser, cookie: `makerspace_session=${staff.token}`, 'x-csrf-token': staff.session.csrfToken } })).statusCode).toBe(403);
    expect((await f.app.inject({ ...input, headers: f.browser, payload: { question: 'Training?', model: 'forged' } })).statusCode).toBe(400);
    const result = await f.app.inject({ ...input, headers: { ...f.browser, 'x-user-id': 'forged', 'x-internal-service-token': 'forged' } });
    expect(result.statusCode).toBe(200); expect(result.json().status).toBe('answered');
    expect(f.getReceived()).toMatchObject({ body: { question: 'Training for tools?' }, url: '/internal/v1/answers', headers: { 'x-internal-service-token': f.config.serviceToken } });
    for (const key of ['x-user-id', 'cookie', 'x-csrf-token']) expect(f.getReceived()!.headers[key]).toBeUndefined();
    f.setMode('uncertain'); expect((await f.app.inject({ ...input, headers: f.browser })).json().status).toBe('uncertain');
    f.setMode('error'); const failure = await f.app.inject({ ...input, headers: f.browser }); expect(failure.statusCode).toBe(503); expect(failure.body).not.toContain('private');
  } finally { await f.dispose(); }
});
it('rejects malformed/spoofed/redirect/oversized replies and bounds the route to six attempts per minute', async () => {
  const f = await fixture();
  try {
    for (const mode of ['wrong-id', 'extra', 'redirect', 'huge', 'error', 'extra']) {
      f.setMode(mode); const result = await f.app.inject({ method: 'POST', url: '/api/v1/question', headers: f.browser, payload: { question: 'Training?' } });
      expect(result.statusCode).toBe(503); expect(result.json().error.code).toBe('knowledge_unavailable');
    }
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/question', headers: f.browser, payload: { question: 'Training?' } })).statusCode).toBe(429);
  } finally { await f.dispose(); }
});
it('rechecks expiry after model work instead of reviving a session', async () => {
  const f = await fixture();
  try {
    f.setMode('waiting'); const waiting = f.wait();
    const pending = f.app.inject({ method: 'POST', url: '/api/v1/question', headers: f.browser, payload: { question: 'Training?' } });
    const result = Promise.resolve(pending); await waiting; f.expire(); f.release();
    expect((await result).statusCode).toBe(401);
  } finally { await f.dispose(); }
});

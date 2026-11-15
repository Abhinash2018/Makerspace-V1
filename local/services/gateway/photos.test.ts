import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { makeServer } from '../../packages/http/server.ts';
import { registerAuth } from './auth.ts';
import { registerPhotos } from './photos.ts';
import { photoConsentVersion } from '../../packages/contracts/photos.ts';

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms006-proxy-')), visitId = randomUUID(), photoId = randomUUID(), bytes = Buffer.from([255, 216, 255, 217]);
  let mode = 'ok', now = 0, seen: { body: Record<string, unknown>; headers: Record<string, unknown> } | undefined, reached: (() => void) | undefined, release: (() => void) | undefined;
  const backend = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += String(chunk); }); req.on('end', () => {
      seen = { body: body ? JSON.parse(body) : {}, headers: req.headers };
      const respond = () => {
        res.setHeader('content-type', 'application/json');
        const requestId = mode === 'wrong-id' ? randomUUID() : req.headers['x-request-id'];
        if (req.method === 'GET') { res.end(JSON.stringify({ requestId, photoId, visitId, mime: mode === 'mime' ? 'text/html' : 'image/jpeg', width: 64, height: 64, byteLength: bytes.length, sha256: mode === 'hash' ? 'a'.repeat(64) : createHash('sha256').update(bytes).digest('hex'), image: bytes.toString('base64') })); return; }
        if (req.url?.endsWith('/remove')) { res.end(JSON.stringify({ requestId, removed: true, pendingCleanup: false })); return; }
        res.end(JSON.stringify({ requestId, photoId, visitId: seen!.body.visitId, saved: true, replayed: false, expiresAt: '2026-12-14T18:00:00Z', consentVersion: photoConsentVersion }));
      };
      if (mode === 'waiting') { release = respond; reached?.(); } else respond();
    });
  });
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve)); const port = (backend.address() as AddressInfo).port;
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent', ATTENDANCE_PORT: String(port), ATTENDANCE_URL: `http://127.0.0.1:${port}` }, root);
  const origin = 'http://127.0.0.1:3000', app = makeServer({ service: 'gateway', port: 3000, origins: [origin], logLevel: 'silent' });
  const auth = registerAuth(app, { directory: path.join(root, 'gateway'), origins: [origin], now: () => now }); registerPhotos(app, config, auth);
  const kiosk = auth.sessions.create('kiosk'), staff = auth.sessions.create('staff');
  const headers = (issued: typeof kiosk) => ({ host: '127.0.0.1:3000', origin, cookie: `makerspace_session=${issued.token}`, 'x-csrf-token': issued.session.csrfToken });
  return { app, auth, kiosk, staff, headers, visitId, bytes, config, seen: () => seen, mode: (value: string) => { mode = value; }, expire: () => { now = 900000; }, wait: () => new Promise<void>(resolve => { reached = resolve; }), release: () => release?.(),
    input: { visitId, idempotencyKey: randomUUID(), consent: true, consentVersion: photoConsentVersion, image: bytes.toString('base64') },
    dispose: async () => { backend.closeAllConnections(); await app.close(); await new Promise<void>(resolve => backend.close(() => resolve())); rmSync(root, { recursive: true, force: true }); },
  };
}
it('separates kiosk proof/consent mutations from staff-only bytes and constructs trusted internal context', async () => {
  const f = await fixture();
  try {
    const url = `/api/v1/staff/visits/${f.visitId}/photo`;
    expect((await f.app.inject({ url, headers: f.headers(f.kiosk) })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: f.headers(f.staff), payload: f.input })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: { ...f.headers(f.kiosk), 'x-csrf-token': 'wrong' }, payload: f.input })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: f.headers(f.kiosk), payload: { ...f.input, consent: false } })).statusCode).toBe(400);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: f.headers(f.kiosk), payload: { ...f.input, sessionScope: 'b'.repeat(64) } })).statusCode).toBe(400);
    const upload = await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: { ...f.headers(f.kiosk), 'x-user-id': 'forged' }, payload: f.input }); expect(upload.statusCode).toBe(200);
    expect(f.seen()!.body.sessionScope).toBe(createHash('sha256').update(f.kiosk.session.csrfToken).digest('hex')); expect(f.seen()!.headers['x-internal-service-token']).toBe(f.config.serviceToken);
    for (const key of ['cookie', 'x-csrf-token', 'x-user-id']) expect(f.seen()!.headers[key]).toBeUndefined();
    const image = await f.app.inject({ url, headers: f.headers(f.staff) }); expect(image.statusCode).toBe(200); expect(image.rawPayload).toEqual(f.bytes); expect(image.headers['cache-control']).toBe('no-store'); expect(image.headers['content-type']).toContain('image/jpeg');
    expect((await f.app.inject({ method: 'DELETE', url, headers: { ...f.headers(f.staff), 'x-csrf-token': 'wrong' }, payload: {} })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'DELETE', url, headers: f.headers(f.staff), payload: {} })).statusCode).toBe(200); expect(f.seen()!.body).toEqual({ actor: 'staff', visitId: f.visitId });
  } finally { await f.dispose(); }
});
it('rejects image integrity/mime/request-ID forgeries and expired staff before sending bytes', async () => {
  const f = await fixture();
  try {
    const url = `/api/v1/staff/visits/${f.visitId}/photo`;
    for (const mode of ['hash', 'mime', 'wrong-id']) { f.mode(mode); const result = await f.app.inject({ url, headers: f.headers(f.staff) }); expect(result.statusCode).toBe(503); expect(result.headers['content-type']).toContain('application/json'); }
    f.mode('waiting'); const waiting = f.wait(), pending = Promise.resolve(f.app.inject({ url, headers: f.headers(f.staff) })); await waiting; f.expire(); f.release(); expect((await pending).statusCode).toBe(401);
  } finally { await f.dispose(); }
});
it('bounds kiosk upload work to six requests per minute', async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 6; index++) expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: f.headers(f.kiosk), payload: f.input })).statusCode).toBe(200);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/visit-photo', headers: f.headers(f.kiosk), payload: f.input })).statusCode).toBe(429);
  } finally { await f.dispose(); }
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../../tests/runtime-fixture.ts';
import { createGateway } from './index.ts';
import { provisionStaff } from './credentials.ts';

it('withholds decrypted staff records when access is revoked during the upstream request', async () => {
  const fixture = await runtimeFixture();
  let release: () => void = () => {}, started: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { started = resolve; });
  const upstream = createServer(async (request, response) => {
    started(); await waiting;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ requestId: request.headers['x-request-id'], records: [{ enrollmentId: randomUUID(), name: 'Synthetic protected face identity', netId: 'syntheticprotected', expiresAt: '2027-01-01T00:00:00.000Z' }], next: null }));
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const port = (upstream.address() as AddressInfo).port;
  const config = { ...fixture.config, faceEnabled: true, urls: { ...fixture.config.urls, face: `http://127.0.0.1:${port}` } };
  await provisionStaff(path.join(config.runtime.root, 'gateway'), 'Synthetic protected face staff passphrase');
  const gateway = createGateway(config, { dev: true }), host = `127.0.0.1:${config.ports.gateway}`, origin = `http://${host}`;
  try {
    const boot = await gateway.inject({ method: 'POST', url: '/api/v1/session', headers: { host, origin, 'x-kiosk-bootstrap': '1' }, payload: {} });
    const signedIn = await gateway.inject({ method: 'POST', url: '/api/v1/staff/login', headers: { host, origin, cookie: String(boot.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': boot.json().csrfToken }, payload: { password: 'Synthetic protected face staff passphrase' } });
    expect(signedIn.statusCode).toBe(200);
    const staff = { host, origin, cookie: String(signedIn.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': signedIn.json().csrfToken };
    const pending = gateway.inject({ method: 'GET', url: '/api/v1/staff/face/enrollments', headers: staff }).then(value => value);
    await requested;
    const reset = await gateway.inject({ method: 'POST', url: '/api/v1/session', headers: staff, payload: {} }); expect(reset.statusCode).toBe(200);
    release(); const result = await pending;
    expect(result.statusCode).toBe(401); expect(result.body).not.toContain('Synthetic protected face identity'); expect(result.body).not.toContain('syntheticprotected');
  } finally { release(); await gateway.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); fixture.dispose(); }
});

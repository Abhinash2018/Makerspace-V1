import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { createStatus } from './status.ts';

it('bounds fan-out with a shared cache and recovers after dependency failure', async () => {
  let calls = 0, modelReady = true, attendanceReady = true, clock = 0, badId = false;
  const services = (['attendance', 'knowledge'] as const).map(service => createServer((req, res) => {
    calls++;
    expect(req.headers['x-internal-service-token']).toBe('a'.repeat(64));
    res.setHeader('content-type', 'application/json');
    const requestId = badId ? randomUUID() : req.headers['x-request-id'];
    if (req.url === '/internal/v1/model-status') res.end(JSON.stringify({ requestId, runtimeAvailable: modelReady, modelAvailable: modelReady, code: modelReady ? 'ready' : 'runtime_unavailable' }));
    else { res.statusCode = service === 'attendance' && !attendanceReady ? 503 : 200; res.end(JSON.stringify({ service, requestId, ready: true, code: 'ready' })); }
  }));
  await Promise.all(services.map(server => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))));
  const [a, k] = services.map(server => (server.address() as AddressInfo).port);
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), ATTENDANCE_PORT: String(a), KNOWLEDGE_PORT: String(k), ATTENDANCE_URL: `http://127.0.0.1:${a}`, KNOWLEDGE_URL: `http://127.0.0.1:${k}` });
  const status = createStatus(config, () => true, () => clock);
  try {
    const ids = [randomUUID(), randomUUID()];
    const results = await Promise.all(ids.map(status));
    expect(results.map(item => item.requestId)).toEqual(ids); expect(calls).toBe(3); expect(results[0]?.state).toBe('ready');
    modelReady = false; expect((await status(randomUUID())).state).toBe('ready'); expect(calls).toBe(3);
    clock += 5001; const degraded = await status(randomUUID()); expect(degraded.state).toBe('degraded'); expect(degraded.components.attendance.ready).toBe(true);
    attendanceReady = false; clock += 5001; expect((await status(randomUUID())).state).toBe('unavailable');
    attendanceReady = true; modelReady = true; clock += 5001; expect((await status(randomUUID())).state).toBe('ready');
    badId = true; clock += 5001; expect((await status(randomUUID())).state).toBe('unavailable');
    expect((await createStatus(config, () => false)(randomUUID())).components.gateway.code).toBe('ui_missing');
  } finally { await Promise.all(services.map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); }
});

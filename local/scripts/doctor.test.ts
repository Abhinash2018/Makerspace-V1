import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../packages/config/index.mjs';
import { diagnose } from './doctor.ts';

it('reports aggregate readiness without returning paths or secrets and handles a stopped gateway', async () => {
  let state = 'ready';
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const ready = { ready: true, code: 'ready' };
    res.end(JSON.stringify({ apiVersion: 1, requestId: req.headers['x-request-id'], state, components: { gateway: ready, attendance: ready, knowledge: ready, ollama: state === 'ready' ? ready : { ready: false, code: 'model_missing' } } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = parseConfiguration({ GATEWAY_PORT: String((server.address() as AddressInfo).port), INTERNAL_SERVICE_TOKEN: 'a'.repeat(64) });
  try {
    expect((await diagnose(config)).state).toBe('ready');
    state = 'degraded'; const result = await diagnose(config);
    expect(result.state).toBe('degraded'); expect(JSON.stringify(result)).not.toContain(config.serviceToken);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  expect(await diagnose(config)).toMatchObject({ state: 'unavailable', code: 'gateway_unavailable' });
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { probeModel } from './ollama.ts';

it('bounds stalled generation and cancels without returning generated content', async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'b'.repeat(64) }] }));
    else res.write('{');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: 'synthetic:test' };
  try {
    expect(await probeModel(settings, { timeoutMs: 80 })).toEqual({ ok: false, code: 'timeout' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 80);
    try { expect(await probeModel(settings, { signal: controller.signal })).toEqual({ ok: false, code: 'cancelled' }); }
    finally { clearTimeout(timer); }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

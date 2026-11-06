import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { inspectModel, probeModel } from './ollama.ts';

it('discovers only a configured local model and probes with bounded fixed content', async () => {
  let mode = 'ready'; const requests: string[] = []; const gpuRequests: unknown[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`); res.setHeader('content-type', 'application/json');
    if (mode === 'redirect') { res.writeHead(302, { location: 'http://example.invalid/' }); res.end(); return; }
    if (mode === 'slow') { res.write('{'); return; }
    if (mode === 'huge') { res.end('x'.repeat(270000)); return; }
    if (mode === 'invalid') { res.end('{bad'); return; }
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: mode === 'missing' ? [] : [{ name: 'synthetic:test', digest: 'a'.repeat(64), ...(mode === 'cloud' ? { remote_host: 'remote.invalid' } : {}) }] })); return;
    }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      const input = JSON.parse(body);
      gpuRequests.push(input.options.num_gpu);
      expect(input.options.num_ctx).toBe(4096);
      expect(input).toMatchObject({ model: 'synthetic:test', stream: false, options: { num_predict: 8, temperature: 0 }, messages: [{ role: 'user', content: 'Reply with OK.' }] });
      res.end(JSON.stringify({ done: true, model: 'synthetic:test', message: { role: 'assistant', content: 'OK' } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: 'synthetic:test' };
  try {
    expect((await inspectModel(settings)).code).toBe('ready');
    const probe = await probeModel(settings);
    expect(probe).toMatchObject({ ok: true, digest: 'a'.repeat(64) });
    expect(JSON.stringify(probe)).not.toMatch(/Reply|content|prompt/);
    expect(probe.execution).toBe('automatic');
    expect(await probeModel(settings, { cpuOnly: true })).toMatchObject({ ok: true, execution: 'cpu' });
    expect(gpuRequests).toEqual([undefined, 0]);
    for (const [value, expected] of [['missing', 'model_missing'], ['cloud', 'cloud_model_rejected'], ['redirect', 'redirect_rejected'], ['huge', 'response_too_large'], ['invalid', 'invalid_response'], ['slow', 'timeout']]) {
      mode = value!; expect((await inspectModel(settings, { timeoutMs: 40 })).code).toBe(expected);
    }
    expect((await inspectModel({ ...settings, model: null })).code).toBe('model_not_configured');
    expect((await inspectModel({ ...settings, model: 'synthetic:cloud' })).code).toBe('cloud_model_rejected');
    const controller = new AbortController(); controller.abort();
    expect((await inspectModel(settings, { signal: controller.signal })).code).toBe('cancelled');
    expect(requests.every(value => value === 'GET /api/tags' || value === 'POST /api/chat')).toBe(true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  expect((await inspectModel(settings)).code).toBe('runtime_unavailable');
}, 15000);

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { embedTexts, normalizeVector } from './embeddings.ts';
import { defaultEmbeddingSettings } from './settings.ts';

it('bounds a fixed local embedding request and rejects unsafe or inconsistent model/vector replies', async () => {
  let mode = 'ready', calls = 0;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`); res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') {
      calls++;
      res.end(JSON.stringify({ models: [{ name: 'embeddinggemma:latest', digest: (mode === 'changed' && calls % 2 === 0 ? 'b' : 'a').repeat(64), ...(mode === 'remote' ? { remote_host: 'remote.invalid' } : {}) }] })); return;
    }
    if (mode === 'slow') { res.write('{'); return; }
    if (mode === 'huge') { res.end('x'.repeat(1024 * 1024 + 1)); return; }
    if (mode === 'redirect') { res.writeHead(302, { location: 'http://example.invalid/' }); res.end(); return; }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      const input = JSON.parse(body);
      expect(input).toMatchObject({ model: 'embeddinggemma:latest', truncate: false, options: { num_ctx: 2048, num_gpu: 0 } });
      expect(input.input).toEqual(['title: none | text: Synthetic training policy.', 'title: none | text: Synthetic hours.']);
      res.end(JSON.stringify({ model: mode === 'wrongmodel' ? 'other' : input.model,
        embeddings: mode === 'count' ? [[3, 4]] : mode === 'zero' ? [[0, 0], [0, 0]] : mode === 'invalid' ? [[null, 1], [1, 0]] : mode === 'dimensions' ? [[1, 0], [1, 0, 0]] : [[3, 4], [0, 1]],
      }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const settings = defaultEmbeddingSettings('embeddinggemma');
  const texts = ['Synthetic training policy.', 'Synthetic hours.'];
  try {
    const result = await embedTexts(url, settings, texts);
    expect(result.identity).toMatchObject({ model: 'embeddinggemma:latest', digest: 'a'.repeat(64), dimensions: 2 });
    expect(result.vectors[0]![0]).toBeCloseTo(0.6); expect(Math.hypot(...result.vectors[0]!)).toBeCloseTo(1);
    await expect(embedTexts(url, settings, texts, { expected: { ...result.identity, dimensions: 3 } })).rejects.toMatchObject({ code: 'index_incompatible' });
    for (const [next, expected] of [['remote', 'cloud_model_rejected'], ['wrongmodel', 'invalid_response'], ['count', 'invalid_response'], ['zero', 'invalid_vector'], ['invalid', 'invalid_vector'], ['dimensions', 'invalid_vector'], ['huge', 'response_too_large'], ['redirect', 'redirect_rejected'], ['slow', 'timeout'], ['changed', 'model_changed']]) {
      mode = next!; calls = 0;
      await expect(embedTexts(url, settings, texts, { timeoutMs: 80 })).rejects.toMatchObject({ code: expected });
    }
    const controller = new AbortController(); controller.abort();
    await expect(embedTexts(url, settings, texts, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    await expect(embedTexts('https://remote.invalid', settings, texts)).rejects.toMatchObject({ code: 'runtime_unavailable' });
    await expect(embedTexts(url, settings, [])).rejects.toMatchObject({ code: 'input_limits' });
    await expect(embedTexts(url, settings, ['x'.repeat(1401)])).rejects.toMatchObject({ code: 'input_limits' });
    expect(requests.every(request => ['GET /api/tags', 'POST /api/embed'].includes(request))).toBe(true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('rejects nonfinite, zero, oversized or incompatible vectors without including values in errors', () => {
  for (const value of [[NaN], [Infinity], [1e11], [0], [], Array(4097).fill(1), null]) expect(() => normalizeVector(value)).toThrow('invalid_vector');
  expect(() => normalizeVector([1, 2], 3)).toThrow('invalid_vector');
});

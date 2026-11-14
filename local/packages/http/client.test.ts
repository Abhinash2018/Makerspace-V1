import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { boundedJson, boundedResponse } from './client.ts';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function endpoint(handler: RequestListener) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
it('bounds real HTTP bodies, refuses redirects/non-JSON and never retries', async () => {
  let count = 0;
  const base = await endpoint((_req, res) => {
    count++; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  expect(await boundedJson(base)).toEqual({ ok: true }); expect(count).toBe(1);
  const redirect = await endpoint((_req, res) => { res.writeHead(302, { location: base }); res.end(); });
  await expect(boundedJson(redirect)).rejects.toMatchObject({ code: 'redirect_rejected' }); expect(count).toBe(1);
  await expect(boundedJson(base, { maxBytes: 2 })).rejects.toMatchObject({ code: 'response_too_large' });
  const chunked = await endpoint((_req, res) => { res.setHeader('content-type', 'application/json'); res.write('['); res.end('1,'.repeat(100)); });
  await expect(boundedJson(chunked, { maxBytes: 20 })).rejects.toMatchObject({ code: 'response_too_large' });
  const html = await endpoint((_req, res) => { res.end('html'); });
  await expect(boundedJson(html)).rejects.toMatchObject({ code: 'invalid_response' });
});
it('times out headers and stalled bodies and propagates caller cancellation', async () => {
  const slow = await endpoint((_req, res) => { res.setHeader('content-type', 'application/json'); res.write('{'); });
  await expect(boundedJson(slow, { timeoutMs: 40 })).rejects.toMatchObject({ code: 'timeout' });
  const controller = new AbortController(); controller.abort();
  await expect(boundedJson(slow, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
  await expect(boundedJson('https://example.invalid')).rejects.toMatchObject({ code: 'runtime_unavailable' });
});
it('returns only explicitly accepted error statuses while retaining body and redirect bounds', async () => {
  let count = 0;
  const conflict = await endpoint((_req, res) => { count++; res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"code":"idempotency_conflict"}'); });
  await expect(boundedJson(conflict)).rejects.toMatchObject({ code: 'http_error' });
  expect(await boundedResponse(conflict, { acceptStatuses: [409] })).toEqual({ statusCode: 409, body: { code: 'idempotency_conflict' } });
  expect(count).toBe(2);
  await expect(boundedResponse(conflict, { acceptStatuses: [503] })).rejects.toMatchObject({ code: 'http_error' });
  await expect(boundedResponse(conflict, { acceptStatuses: [409], maxBytes: 8 })).rejects.toMatchObject({ code: 'response_too_large' });
  const bad = await endpoint((_req, res) => { res.writeHead(409, { 'content-type': 'application/json' }); res.end('not-json'); });
  await expect(boundedResponse(bad, { acceptStatuses: [409] })).rejects.toMatchObject({ code: 'invalid_response' });
  const redirect = await endpoint((_req, res) => { res.writeHead(302, { location: conflict }); res.end(); });
  await expect(boundedResponse(redirect, { acceptStatuses: [302] })).rejects.toMatchObject({ code: 'redirect_rejected' });
});

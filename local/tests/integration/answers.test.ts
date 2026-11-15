import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { configureEmbeddings } from '../../services/knowledge/settings.ts';
import { publishDocuments } from '../../services/knowledge/repository.ts';
import { chunkerVersion } from '../../services/knowledge/chunks.ts';

it('keeps bounded model work alive past the default idle timeout, rejects overload and cancels through both HTTP hops', async () => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  let mode = 'slow', reached: (() => void) | undefined, closed: (() => void) | undefined;
  const text = 'Synthetic tools require staff training before use.';
  const provider = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] })); return; }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      const input = JSON.parse(body);
      if (req.url === '/api/embed') { res.end(JSON.stringify({ model: 'synthetic:test', embeddings: [[1, 0]] })); return; }
      expect(input.options.num_gpu).toBe(0); expect(input.tools).toBeUndefined();
      if (mode === 'stall') { reached?.(); res.once('close', () => closed?.()); return; }
      const respond = () => res.end(JSON.stringify({ model: 'synthetic:test', done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ quotes: [{ source: 'S1', text }] }) } }));
      if (mode === 'slow') setTimeout(respond, 5500); else respond();
    });
  });
  await new Promise<void>(resolve => provider.listen(Number(new URL(fixture.config.urls.ollama).port), '127.0.0.1', resolve));
  try {
    migrateAll(fixture.root, fixture.env); configureEmbeddings(fixture.config.runtime.knowledge, 'synthetic:test');
    publishDocuments(fixture.config.runtime.knowledge, { model: 'synthetic:test', digest: 'a'.repeat(64), dimensions: 2, documentPrefix: '', queryPrefix: '', chunkerVersion }, [{ key: 'policy', title: 'Synthetic policy', sourceHash: 'b'.repeat(64), pageCount: 1, emptyPages: [], expectedVersion: 0, chunks: [{ ordinal: 1, page: 1, text }], vectors: [[1, 0]] }]);
    running = await launch('start', fixture.root, fixture.env);
    const gateway = `http://127.0.0.1:${fixture.config.ports.gateway}`, knowledge = fixture.config.urls.knowledge;
    expect((await fetch(`${knowledge}/internal/v1/answers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Training?' }) })).status).toBe(401);
    const bootstrap = await fetch(`${gateway}/api/v1/session`, { method: 'POST', headers: { origin: gateway, 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' }, body: '{}' });
    const session = await bootstrap.json();
    const headers = { origin: gateway, 'content-type': 'application/json', cookie: bootstrap.headers.get('set-cookie')!.split(';')[0]!, 'x-csrf-token': session.csrfToken };
    const ask = (signal?: AbortSignal) => fetch(`${gateway}/api/v1/question`, { method: 'POST', headers, body: JSON.stringify({ question: 'What training is required?' }), signal: signal ?? AbortSignal.timeout(15000) });
    const started = performance.now(), first = await ask(); expect(first.status).toBe(200); expect((await first.json()).excerpts[0].citation.page).toBe(1); expect(performance.now() - started).toBeGreaterThan(5000);
    mode = 'stall'; const cancellation = new AbortController();
    const waiting = new Promise<void>(resolve => { reached = resolve; }), cancelled = new Promise<void>(resolve => { closed = resolve; });
    const pending = ask(cancellation.signal);
    await Promise.race([waiting, delay(10000).then(() => { throw new Error('Synthetic provider not reached'); })]);
    const overloaded = await ask(); expect(overloaded.status).toBe(429); expect(overloaded.headers.get('retry-after')).toBe('3');
    cancellation.abort(); await expect(pending).rejects.toThrow();
    await Promise.race([cancelled, delay(10000).then(() => { throw new Error('Upstream cancellation not observed'); })]);
    mode = 'ready'; await delay(50); expect((await ask()).status).toBe(200);
    expect((await fetch(`${fixture.config.urls.attendance}/health/live`)).status).toBe(200);
  } finally { await running?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); fixture.dispose(); }
}, 60000);

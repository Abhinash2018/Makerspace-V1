import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { configureEmbeddings } from '../../services/knowledge/settings.ts';
import { publishDocuments } from '../../services/knowledge/repository.ts';
import { chunkerVersion } from '../../services/knowledge/chunks.ts';

test('shows cited evidence and uncertainty, renders text safely, and clears cancelled/reset/expired questions', async ({ page }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const external: string[] = [], errors: string[] = [];
  const text = 'Synthetic tools require staff training. Literal <script> markup is source text.';
  const provider = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] })); return; }
    req.resume(); req.on('end', () => res.end(JSON.stringify(req.url === '/api/embed' ? { model: 'synthetic:test', embeddings: [[1, 0]] }
      : { model: 'synthetic:test', done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ quotes: [{ source: 'S1', text }] }) } })));
  });
  await new Promise<void>(resolve => provider.listen(Number(new URL(fixture.config.urls.ollama).port), '127.0.0.1', resolve));
  try {
    migrateAll(fixture.root, fixture.env); configureEmbeddings(fixture.config.runtime.knowledge, 'synthetic:test');
    publishDocuments(fixture.config.runtime.knowledge, { model: 'synthetic:test', digest: 'a'.repeat(64), dimensions: 2, documentPrefix: '', queryPrefix: '', chunkerVersion }, [{ key: 'policy', title: 'Synthetic <b>policy</b>', sourceHash: 'b'.repeat(64), pageCount: 2, emptyPages: [1], expectedVersion: 0, chunks: [{ ordinal: 1, page: 2, text }], vectors: [[1, 0]] }]);
    running = await launch('start', fixture.root, fixture.env);
    const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
    await page.route('**/*', route => { if (route.request().url().startsWith(base + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    const enter = async () => { await page.getByRole('button', { name: 'Begin', exact: true }).click(); await page.getByRole('button', { name: 'Ask a question Approved document evidence' }).click(); await expect(page.getByLabel('Your question')).toBeFocused(); };
    await enter();
    await page.getByLabel('Your question').fill('What training is required for tools?');
    await page.getByRole('button', { name: 'Find document evidence' }).click();
    await expect(page.getByRole('heading', { name: 'Approved document evidence' })).toBeFocused();
    await expect(page.locator('blockquote')).toHaveText(text);
    await expect(page.locator('figcaption')).toHaveText('Synthetic <b>policy</b> — version 1, page 2');
    expect(await page.locator('blockquote script, figcaption b').count()).toBe(0);
    await page.screenshot({ path: info.outputPath('answers-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('answers-mobile-evidence.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Ask another question' }).click(); await expect(page.getByLabel('Your question')).toHaveValue('');
    await page.getByLabel('Your question').fill('What is the WiFi password?'); await page.getByRole('button', { name: 'Find document evidence' }).click();
    await expect(page.getByText('I couldn’t find enough approved evidence to answer. Please ask Makerspace staff.')).toBeVisible();
    await page.getByRole('button', { name: 'Ask another question' }).click();
    let reached: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    await page.route('**/api/v1/question', async route => { reached?.(); await new Promise<void>(resolve => setTimeout(resolve, 1000)); await route.abort().catch(() => undefined); });
    await page.getByLabel('Your question').fill('Transient synthetic training question'); await page.getByRole('button', { name: 'Find document evidence' }).click(); await waiting;
    await page.getByRole('button', { name: 'Cancel and clear' }).click(); await expect(page.getByLabel('Your question')).toHaveValue('');
    await expect(page.getByText('Question cancelled and cleared.')).toBeVisible();
    await page.unroute('**/api/v1/question');
    await page.route('**/api/v1/question', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'knowledge_unavailable', message: 'Unavailable.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) }));
    await page.getByLabel('Your question').fill('Training?'); await page.getByRole('button', { name: 'Find document evidence' }).click();
    await expect(page.getByText('Document answers are unavailable. Please ask Makerspace staff.')).toBeVisible(); await expect(page.getByLabel('Your question')).toHaveValue('');
    await page.unroute('**/api/v1/question');
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('answers-mobile.png'), fullPage: true });
    await page.getByLabel('Your question').fill('Clear this on back'); await page.getByRole('button', { name: 'Back to welcome', exact: true }).click(); await enter(); await expect(page.getByLabel('Your question')).toHaveValue('');
    await page.getByLabel('Your question').fill('Clear this on expiry');
    await page.route('**/api/v1/session', route => route.request().method() === 'GET' ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) }) : route.continue());
    await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeVisible({ timeout: 12000 }); await expect(page.getByLabel('Your question')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); fixture.dispose(); }
});

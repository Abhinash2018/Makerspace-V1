import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { configureEmbeddings } from '../../services/knowledge/settings.ts';
import { publishDocuments } from '../../services/knowledge/repository.ts';
import { chunkerVersion } from '../../services/knowledge/chunks.ts';

test('chats with follow-ups and citations, supports keyboard/stop/retry, and clears private state', async ({ page }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const external: string[] = [], errors: string[] = [], inputs: { question: string; history: unknown[] }[] = [];
  const text = 'Synthetic tools require staff training. Literal <script> markup is source text.';
  const prose = 'Complete staff training before using these tools. Literal <script> text stays visible.';
  const provider = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] })); return; }
    let body = ''; req.on('data', part => { body += String(part); });
    req.on('end', () => {
      if (req.url === '/api/embed') { res.end(JSON.stringify({ model: 'synthetic:test', embeddings: [[1, 0]] })); return; }
      const data = JSON.parse(JSON.parse(body).messages[1].content);
      res.end(JSON.stringify({ model: 'synthetic:test', done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ answer: data.currentQuestion.includes('WiFi') ? '' : prose, sources: data.currentQuestion.includes('WiFi') ? [] : ['S1'] }) } }));
    });
  });
  await new Promise<void>(resolve => provider.listen(Number(new URL(fixture.config.urls.ollama).port), '127.0.0.1', resolve));
  try {
    migrateAll(fixture.root, fixture.env); configureEmbeddings(fixture.config.runtime.knowledge, 'synthetic:test');
    publishDocuments(fixture.config.runtime.knowledge, { model: 'synthetic:test', digest: 'a'.repeat(64), dimensions: 2, documentPrefix: '', queryPrefix: '', chunkerVersion }, [{ key: 'policy', title: 'Synthetic <b>policy</b>', sourceHash: 'b'.repeat(64), pageCount: 2, emptyPages: [1], expectedVersion: 0, chunks: [{ ordinal: 1, page: 2, text }], vectors: [[1, 0]] }]);
    running = await launch('start', fixture.root, fixture.env);
    const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
    await page.route('**/*', route => { if (route.request().url().startsWith(base + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (req.url().endsWith('/api/v1/chat')) inputs.push(req.postDataJSON()); });
    await page.goto(base);
    const enter = async () => { await page.getByRole('button', { name: 'Begin', exact: true }).click(); await page.getByRole('button', { name: 'Ask a question Local PDF chatbot' }).click(); await expect(page.getByLabel('Your question')).toBeFocused(); };
    await enter();
    await page.getByLabel('Your question').fill('How do I use the tools?'); await page.getByLabel('Your question').press('Enter');
    await expect(page.getByText(prose, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your question')).toBeVisible(); await expect(page.getByLabel('Your question')).toBeFocused();
    await page.locator('summary').click(); await expect(page.locator('blockquote')).toHaveText(text);
    await expect(page.locator('figcaption')).toHaveText('Synthetic <b>policy</b> — page 2, version 1');
    expect(await page.locator('.chat script, .chat b').count()).toBe(0);
    await page.screenshot({ path: info.outputPath('chat-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('chat-mobile.png'), fullPage: true });
    await page.getByLabel('Your question').fill('Which training?'); await page.getByLabel('Your question').press('Shift+Enter');
    await expect(page.getByLabel('Your question')).toHaveValue('Which training?\n');
    await page.getByLabel('Your question').press('Enter'); await expect(page.getByText(prose, { exact: true })).toHaveCount(2);
    expect(inputs[1]!.history).toEqual([{ role: 'user', content: 'How do I use the tools?' }, { role: 'assistant', content: prose }]);
    await page.getByRole('button', { name: 'New chat', exact: true }).click(); await expect(page.getByText(prose, { exact: true })).toHaveCount(0);
    await page.getByLabel('Your question').fill('What is the WiFi password?'); await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/I couldn’t find enough information/)).toBeVisible(); expect(inputs[2]!.history).toEqual([]);
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    let reached: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    await page.route('**/api/v1/chat', async route => { reached?.(); await new Promise<void>(resolve => setTimeout(resolve, 1000)); await route.abort().catch(() => undefined); });
    await page.getByLabel('Your question').fill('Transient synthetic question'); await page.getByLabel('Your question').press('Enter'); await waiting;
    await page.getByRole('button', { name: 'Stop response' }).click(); await expect(page.getByText('Response stopped. You can retry this question.')).toBeVisible();
    await page.unroute('**/api/v1/chat');
    await page.getByRole('button', { name: 'Retry question' }).click(); await expect(page.getByText(prose, { exact: true })).toHaveCount(1);
    await expect(page.getByText('Transient synthetic question', { exact: true })).toHaveCount(1);
    await page.route('**/api/v1/chat', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.getByLabel('Your question').fill('Another question'); await page.getByLabel('Your question').press('Enter');
    await expect(page.getByText('The local assistant is unavailable. Please retry or ask Makerspace staff.')).toBeVisible();
    await page.unroute('**/api/v1/chat');
    await page.getByLabel('Your question').fill('Clear this on back'); await page.getByRole('button', { name: 'Back to welcome', exact: true }).click(); await enter();
    await expect(page.getByLabel('Your question')).toHaveValue(''); await expect(page.getByText(prose, { exact: true })).toHaveCount(0);
    await page.getByLabel('Your question').fill('Clear this on expiry');
    await page.route('**/api/v1/session', route => route.request().method() === 'GET' ? route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }) : route.continue());
    await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeVisible({ timeout: 12000 }); await expect(page.getByLabel('Your question')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); fixture.dispose(); }
});

import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch, stopChild } from '../../scripts/launch.ts';

test('built kiosk stays usable through service loss with external requests blocked', async ({ page, context }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const external: string[] = [], requests: string[] = [], errors: string[] = [];
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  try {
    migrateAll(fixture.root, fixture.env);
    running = await launch('start', fixture.root, fixture.env);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { external.push(url.origin); return route.abort(); }
      requests.push(`${route.request().method()} ${url.pathname}`); return route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await expect(page.getByText('Ingram Makerspace Assistant', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Local AI needs attention');
    await page.getByRole('button', { name: 'Begin' }).click();
    await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Check in Coming soon' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ask a question Coming soon' })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to welcome' }).click();
    await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole('button', { name: 'Begin' }).boundingBox())?.height).toBeGreaterThanOrEqual(48);
    await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
    await stopChild(running.children.attendance!);
    await expect(page.getByRole('status')).toHaveText('Some services unavailable', { timeout: 16000 });
    await stopChild(running.children.gateway!);
    await expect(page.getByRole('status')).toHaveText('Gateway unavailable', { timeout: 16000 });
    await page.getByRole('button', { name: 'Begin' }).click();
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('gateway');
    expect(external).toEqual([]); expect(errors).toEqual([]);
    expect(requests.every(value => value === 'GET /' || value.startsWith('GET /assets/') || value === 'GET /api/v1/system/status' || value === 'GET /api/v1/session' || value === 'POST /api/v1/session')).toBe(true);
  } finally { await running?.stop(); fixture.dispose(); }
});

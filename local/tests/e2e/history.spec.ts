import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { recordVisit } from '../../services/attendance/visits.ts';

test('staff pages/exports private history and clears it on logout, visitor reset and expiry', async ({ page }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const password = 'synthetic staff history browser passphrase';
  const external: string[] = [], errors: string[] = [];
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password); migrateAll(fixture.root, fixture.env);
    const at = Date.now();
    for (let index = 0; index < 27; index++) recordVisit(fixture.config.runtime.attendance, { name: index === 0 ? '=SUM(1,1)' : `Synthetic private visitor ${index}`, netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'c'.repeat(64) }, at - index * 1000);
    running = await launch('start', fixture.root, fixture.env);
    const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
    await page.route('**/*', route => { if (route.request().url().startsWith(base + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
    page.on('pageerror', error => errors.push(error.message)); await page.goto(base);
    const signIn = async () => { await page.getByRole('button', { name: 'Staff sign in', exact: true }).click(); await page.getByLabel('Staff password').fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Visit history', exact: true })).toBeFocused(); await expect(page.locator('.history-table tbody tr')).toHaveCount(25); };
    await signIn(); await expect(page.getByText('=SUM(1,1)', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('history-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page.locator('.history-table tbody tr')).toHaveCount(2); await expect(page.getByText('Page 2; 2 visits shown. New arrivals appear after Refresh history.')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('history-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await expect(page.locator('.history-table tbody tr')).toHaveCount(25);
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV', exact: true }).click(); const download = await downloaded;
    expect(download.suggestedFilename()).toBe('makerspace-visits.csv'); const file = await download.path(); expect(file).not.toBeNull(); const csv = readFileSync(file!, 'utf8'); expect(csv).toContain('"\t=SUM(1,1)"'); expect(csv).toContain('Synthetic private visitor');
    await page.getByLabel('From date', { exact: true }).fill('2000-01-01'); await page.getByLabel('To date', { exact: true }).fill('2000-01-01'); await page.getByRole('button', { name: 'Apply dates', exact: true }).click(); await expect(page.getByText('No retained visits match this date range.')).toBeVisible();
    await page.getByLabel('From date', { exact: true }).fill(''); await page.getByLabel('To date', { exact: true }).fill(''); await page.getByRole('button', { name: 'Apply dates', exact: true }).click(); await expect(page.locator('.history-table tbody tr')).toHaveCount(25);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Visit history', exact: true })).toHaveCount(0); await expect(page.getByText('=SUM(1,1)', { exact: true })).toHaveCount(0);
    await signIn(); await page.getByRole('button', { name: 'Begin', exact: true }).click(); await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible(); await expect(page.locator('.history-table')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to welcome', exact: true }).click(); await signIn();
    await page.route('**/api/v1/session', route => route.request().method() === 'GET' ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) }) : route.continue());
    await expect(page.getByRole('heading', { name: 'Visit history', exact: true })).toHaveCount(0, { timeout: 12000 }); await expect(page.getByText('Synthetic private visitor 1', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); fixture.dispose(); }
});

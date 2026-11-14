import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { openAttendance } from '../../services/attendance/database.ts';
import { checkinResponseSchema } from '../../packages/contracts/checkin.ts';

test('records without AI, resolves a lost confirmation with the same key and clears visitor state on reset/expiry', async ({ page, context }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  const keys: string[] = [], external: string[] = [], errors: string[] = [];
  let firstReceipt: string | undefined;
  try {
    migrateAll(fixture.root, fixture.env); running = await launch('start', fixture.root, fixture.env);
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== base) { external.push(new URL(route.request().url()).origin); return route.abort(); }
      return route.continue();
    });
    await page.route('**/api/v1/checkin', async route => {
      keys.push(route.request().postDataJSON().idempotencyKey);
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const receipt = checkinResponseSchema.parse(await response.json());
      if (keys.length === 1) { firstReceipt = receipt.visitId; return route.abort('failed'); } // The real DB committed; only its reply is lost.
      expect(receipt.visitId).toBe(firstReceipt); expect(receipt.replayed).toBe(true);
      return route.fulfill({ response });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await expect(page.getByRole('status')).toHaveText('Local AI needs attention');
    const enterForm = async () => {
      await page.getByRole('button', { name: 'Begin', exact: true }).click();
      await page.getByRole('button', { name: 'Check in Self-reported visit' }).click();
      await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    };
    await enterForm();
    await page.getByLabel('Name', { exact: true }).fill(' Synthetic Browser Visitor ');
    await page.getByLabel('NetID', { exact: true }).fill('not valid');
    await page.getByRole('button', { name: 'Record check-in', exact: true }).click();
    await expect(page.getByLabel('NetID', { exact: true })).toBeFocused();
    await expect(page.getByLabel('NetID', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(keys).toHaveLength(0);
    await page.getByLabel('NetID', { exact: true }).fill(' AB123 ');
    await page.screenshot({ path: info.outputPath('checkin-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Record check-in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be confirmed');
    expect(keys).toHaveLength(1);
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: 'Retry same check-in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check-in recorded' })).toBeFocused();
    expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
    const db = openAttendance(fixture.config.runtime.attendance);
    try { expect(db.prepare('SELECT name, net_id, self_reported FROM visits').all()).toEqual([{ name: 'Synthetic Browser Visitor', net_id: 'ab123', self_reported: 1 }]); }
    finally { db.close(); }
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await enterForm();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(''); await expect(page.getByLabel('NetID', { exact: true })).toHaveValue('');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('checkin-mobile.png'), fullPage: true });
    await page.getByLabel('Name', { exact: true }).fill('Transient Synthetic Visitor'); await page.getByLabel('NetID', { exact: true }).fill('xy456');
    await page.route('**/api/v1/session', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) }) : route.continue());
    await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeVisible({ timeout: 12000 });
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    expect(keys).toHaveLength(2); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); fixture.dispose(); }
});

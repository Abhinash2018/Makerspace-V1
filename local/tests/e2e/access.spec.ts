import path from 'node:path';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';

test('staff login rotates cookies, logout/reset clear access and expiry clears the UI without external requests', async ({ page, context }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  const password = 'synthetic browser staff passphrase';
  const external: string[] = [], errors: string[] = [];
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password);
    migrateAll(fixture.root, fixture.env);
    running = await launch('start', fixture.root, fixture.env);
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== base) { external.push(new URL(route.request().url()).origin); return route.abort(); }
      return route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    const signIn = async (value: string) => {
      if (!(await page.getByLabel('Staff password').isVisible())) await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
      await expect(page.getByLabel('Staff password')).toBeFocused();
      await page.getByLabel('Staff password').fill(value);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    await signIn('incorrect synthetic passphrase');
    await expect(page.getByRole('alert')).toContainText('Sign-in failed');
    await expect(page.getByLabel('Staff password')).toHaveValue('');
    await signIn(password);
    await expect(page.getByText('Staff access active', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Staff password')).toHaveCount(0);
    const staffCookie = (await context.cookies()).find(cookie => cookie.name === 'makerspace_session')!;
    expect(staffCookie.httpOnly).toBe(true); expect(staffCookie.sameSite).toBe('Strict');
    expect(await page.evaluate(() => document.cookie)).not.toContain('makerspace_session');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await page.screenshot({ path: info.outputPath('staff-desktop.png'), fullPage: true });
    await page.reload();
    await expect(page.getByText('Staff access active', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByText('Staff access active', { exact: true })).toHaveCount(0);
    expect((await context.request.get(`${base}/api/v1/session`, { headers: { cookie: `makerspace_session=${staffCookie.value}` } })).status()).toBe(401);
    await signIn(password);
    await expect(page.getByText('Staff access active', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();
    await expect(page.getByText('Staff access active', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to welcome' }).click();
    await signIn(password);
    await expect(page.getByText('Staff access active', { exact: true })).toBeVisible();
    // Browser behavior for an expired session; real deadlines are tested with
    // the gateway's injected monotonic clock, not a fifteen-minute browser wait.
    await page.route('**/api/v1/session', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) })
      : route.continue());
    await expect(page.getByText('Staff access active', { exact: true })).toHaveCount(0, { timeout: 12000 });
    await expect(page.getByRole('alert')).toContainText('expired');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
    await expect(page.getByLabel('Staff password')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('staff-mobile.png'), fullPage: true });
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); fixture.dispose(); }
});

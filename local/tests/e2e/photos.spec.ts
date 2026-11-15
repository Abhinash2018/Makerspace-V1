import path from 'node:path';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { openAttendance } from '../../services/attendance/database.ts';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });
test('optional synthetic camera consent, retake, uncertain retry, withdrawal and private staff lifecycle', async ({ page, context }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`, password = 'synthetic photo browser staff passphrase';
  const errors: string[] = [], external: string[] = [], inputs: string[] = [];
  let loseReply = true;
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password); migrateAll(fixture.root, fixture.env);
    running = await launch('start', fixture.root, fixture.env);
    await context.grantPermissions(['camera'], { origin: base });
    await page.addInitScript(() => {
      const state = { calls: 0, stops: 0, denied: false, hold: false, held: false, release: () => {} };
      Object.assign(window, { syntheticCamera: state });
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        state.calls++; if (state.denied) throw new DOMException('Synthetic denial', 'NotAllowedError');
        const stream = await original(constraints);
        for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { state.stops++; stop(); }; }
        if (state.hold) await new Promise<void>(resolve => { state.release = resolve; state.held = true; });
        return stream;
      };
    });
    await page.route('**/*', route => { if (new URL(route.request().url()).origin === base) return route.continue(); external.push(route.request().url()); return route.abort(); });
    await page.route('**/api/v1/visit-photo', async route => {
      inputs.push(route.request().postDataJSON().image);
      const response = await route.fetch(); expect(response.status()).toBe(200);
      if (loseReply) { loseReply = false; return route.abort('failed'); }
      return route.fulfill({ response });
    });
    page.on('pageerror', error => errors.push(error.message)); await page.goto(base);
    const camera = () => page.evaluate(() => (window as unknown as { syntheticCamera: { calls: number; stops: number; denied: boolean } }).syntheticCamera);
    const visit = async () => {
      await page.getByRole('button', { name: 'Begin', exact: true }).click();
      await page.getByRole('button', { name: 'Check in Self-reported visit' }).click();
      await page.getByLabel('Name', { exact: true }).fill('Synthetic photo visitor'); await page.getByLabel('NetID', { exact: true }).fill('ab123');
      await page.getByRole('button', { name: 'Record check-in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Check-in recorded' })).toBeVisible();
    };
    await visit(); expect((await camera()).calls).toBe(0);
    await page.getByRole('button', { name: 'Add optional photo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Skip photo', exact: true }).click(); expect((await camera()).calls).toBe(0);
    await page.getByRole('button', { name: 'Add optional photo', exact: true }).click();
    await page.getByLabel('I consent to saving an optional visit photo.').check();
    const capture = async () => {
      await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeVisible();
      await expect(page.getByText('Camera active · microphone off', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Capture photo', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Captured photo preview' })).toBeVisible();
      await expect(page.getByText('Camera & microphone off', { exact: true })).toBeVisible();
    };
    await page.getByRole('button', { name: 'Start camera', exact: true }).click(); await capture();
    await page.getByRole('button', { name: 'Retake photo', exact: true }).click(); await capture();
    expect(await camera()).toMatchObject({ calls: 2, stops: 2 });
    await page.screenshot({ path: info.outputPath('photo-preview-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be confirmed');
    await page.getByRole('button', { name: 'Retry same photo', exact: true }).click();
    await expect(page.getByText('Optional photo saved privately with your visit.')).toBeVisible(); expect(inputs[0]).toBe(inputs[1]);
    await expect(page.getByRole('img', { name: 'Captured photo preview' })).toBeHidden();
    await page.getByRole('button', { name: 'Remove photo and withdraw consent', exact: true }).click();
    await expect(page.getByText('Photo consent withdrawn. This visit cannot receive another photo.')).toBeVisible();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await visit();
    await page.getByRole('button', { name: 'Add optional photo', exact: true }).click(); await page.getByLabel('I consent to saving an optional visit photo.').check();
    await page.getByRole('button', { name: 'Start camera', exact: true }).click(); await capture();
    await page.getByRole('button', { name: 'Save photo', exact: true }).click(); await expect(page.getByText('Optional photo saved privately with your visit.')).toBeVisible();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Staff sign in', exact: true }).click(); await page.getByLabel('Staff password').fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'View photo', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Private visit photo' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('photo-staff-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Hide photo', exact: true }).click(); await expect(page.getByRole('img', { name: 'Private visit photo' })).toBeHidden();
    expect(await page.locator('.staff-photo canvas').evaluate(node => (node as HTMLCanvasElement).width)).toBe(0);
    await page.getByRole('button', { name: 'View photo', exact: true }).click(); await expect(page.getByRole('img', { name: 'Private visit photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.locator('.staff-photo canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Staff sign in', exact: true }).click(); await page.getByLabel('Staff password').fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Remove photo', exact: true }).click(); await expect(page.getByRole('button', { name: 'View photo', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Begin', exact: true }).click(); await page.getByRole('button', { name: 'Back to welcome', exact: true }).click();
    await visit(); await page.getByRole('button', { name: 'Add optional photo', exact: true }).click(); await page.getByLabel('I consent to saving an optional visit photo.').check();
    await page.evaluate(() => { (window as unknown as { syntheticCamera: { hold: boolean } }).syntheticCamera.hold = true; });
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { syntheticCamera: { held: boolean } }).syntheticCamera.held)).toBe(true);
    // Skip does not wait for permission. A late acquisition must be stopped, never attached.
    await page.getByRole('button', { name: 'Skip photo', exact: true }).click();
    await page.evaluate(() => { const state = (window as unknown as { syntheticCamera: { hold: boolean; release: () => void } }).syntheticCamera; state.hold = false; state.release(); });
    await expect.poll(async () => (await camera()).stops).toBe(4);
    await expect(page.getByText('Camera & microphone off', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add optional photo', exact: true }).click(); await page.getByLabel('I consent to saving an optional visit photo.').check();
    await page.evaluate(() => { (window as unknown as { syntheticCamera: { denied: boolean } }).syntheticCamera.denied = true; });
    await page.getByRole('button', { name: 'Start camera', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Camera unavailable or permission denied');
    await page.evaluate(() => { (window as unknown as { syntheticCamera: { denied: boolean } }).syntheticCamera.denied = false; });
    await page.getByRole('button', { name: 'Start camera', exact: true }).click(); await expect(page.getByRole('button', { name: 'Capture photo', exact: true })).toBeVisible();
    await page.route('**/api/v1/session', route => route.request().method() === 'GET' ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized.', requestId: '0464accc-6eed-44ce-a064-d38f29dcba93' } }) }) : route.continue());
    await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeVisible({ timeout: 12000 });
    await expect(page.locator('video')).toHaveCount(0); expect(await camera()).toMatchObject({ calls: 6, stops: 5 });
    const db = openAttendance(fixture.config.runtime.attendance);
    try { expect(db.prepare('SELECT COUNT(*) AS count FROM visits').get()).toEqual({ count: 3 }); expect(db.prepare('SELECT COUNT(*) AS count FROM visit_photos').get()).toEqual({ count: 0 }); }
    finally { db.close(); }
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); fixture.dispose(); }
});

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { faceConsentVersion } from '../../packages/contracts/face.ts';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test('synthetic face UI keeps consent separate, retries exact attempts, clears camera/private state, and falls back manually', async ({ page, context }, info) => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`, password = 'Synthetic face browser staff password';
  const requestId = randomUUID(), enrollmentId = randomUUID(), code = 's'.repeat(43), expiresAt = '2027-01-01T00:00:00.000Z';
  const ticket = `${'a'.repeat(60)}.${'b'.repeat(43)}`, enrollments: unknown[] = [], checkins: unknown[] = [], external: string[] = [], errors: string[] = [];
  let loseEnrollment = true, loseCheckin = true, revoked = false;
  try {
    migrateAll(fixture.root, fixture.env); await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password);
    running = await launch('start', fixture.root, fixture.env); await context.grantPermissions(['camera'], { origin: base });
    await page.addInitScript(() => {
      const state = { calls: 0, stops: 0, denied: false, hold: false, held: false, release: () => {} };
      Object.assign(window, { syntheticFaceCamera: state });
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        state.calls++; if (state.denied) throw new DOMException('Synthetic denial', 'NotAllowedError');
        const stream = await get(constraints);
        stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { state.stops++; stop(); }; });
        if (state.hold) await new Promise<void>(resolve => { state.release = resolve; state.held = true; });
        return stream;
      };
    });
    await page.route('**/*', route => { if (new URL(route.request().url()).origin === base) return route.continue(); external.push(route.request().url()); return route.abort(); });
    // Browser tests isolate UI lifecycle; native inference and HTTP trust are tested separately.
    await page.route('**/api/v1/face/status', route => route.fulfill({ json: { requestId, enabled: true, ready: true } }));
    await page.route('**/api/v1/face/enroll', route => {
      enrollments.push(route.request().postDataJSON()); if (loseEnrollment) { loseEnrollment = false; return route.abort('failed'); }
      return route.fulfill({ json: { requestId, enrollmentId, expiresAt, withdrawalCode: code, consentVersion: faceConsentVersion, replayed: true } });
    });
    await page.route('**/api/v1/face/withdraw', route => route.fulfill({ json: { requestId, removed: true } }));
    await page.route('**/api/v1/face/match', route => route.fulfill({ json: { requestId, status: 'matched', ticket, expiresAt } }));
    await page.route('**/api/v1/face/checkin', route => {
      checkins.push(route.request().postDataJSON()); if (loseCheckin) { loseCheckin = false; return route.abort('failed'); }
      return route.fulfill({ json: { requestId, visitId: randomUUID(), recordedAt: '2026-11-17T12:00:00.000Z', selfReported: true, replayed: true } });
    });
    await page.route('**/api/v1/staff/face/enrollments*', route => {
      if (route.request().method() === 'DELETE') { revoked = true; return route.fulfill({ json: { requestId, removed: true } }); }
      return route.fulfill({ json: { requestId, records: revoked ? [] : [{ enrollmentId, name: 'Synthetic face browser visitor', netId: 'syntheticbrowser', expiresAt }], next: null } });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await page.getByRole('button', { name: 'Check in Self-reported visit' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Synthetic face browser visitor'); await page.getByLabel('NetID', { exact: true }).fill('syntheticbrowser');
    await page.getByRole('button', { name: 'Record check-in', exact: true }).click();
    await page.getByRole('button', { name: 'Optional face enrollment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start enrollment camera' })).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { syntheticFaceCamera: { calls: number } }).syntheticFaceCamera.calls)).toBe(0);
    await page.getByLabel('I consent to local face matching', { exact: false }).check();
    await page.getByRole('button', { name: 'Start enrollment camera' }).click(); await expect(page.getByRole('button', { name: 'Capture face', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Capture face', exact: true }).click(); await expect(page.getByText('Camera & microphone off', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('face-enrollment-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('face-enrollment-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save face enrollment' }).click(); await expect(page.getByRole('alert')).toContainText('Could not confirm');
    await page.getByRole('button', { name: 'Retry same enrollment' }).click(); await expect(page.getByLabel('Withdrawal code', { exact: true })).toHaveValue(code);
    expect(enrollments).toHaveLength(2); expect(enrollments[0]).toEqual(enrollments[1]);
    await page.getByRole('button', { name: 'Withdraw face enrollment', exact: true }).click(); await expect(page.getByLabel('Withdrawal code', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Finish', exact: true }).click(); await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await page.getByRole('button', { name: 'Returning visitor face check-in' }).click();
    await page.getByLabel('I choose local face matching for this check-in.').check(); await page.getByRole('button', { name: 'Start matching camera' }).click();
    await expect(page.getByRole('button', { name: 'Capture face', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Capture face', exact: true }).click();
    await page.getByRole('button', { name: 'Find a match' }).click(); await page.getByRole('button', { name: 'Record face check-in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry same face check-in' })).toBeVisible(); await expect(page.getByRole('alert')).toContainText('Could not confirm');
    await page.getByRole('button', { name: 'Retry same face check-in' }).click(); await expect(page.getByRole('heading', { name: 'Check-in recorded', exact: true })).toBeVisible();
    expect(checkins).toHaveLength(2); expect(checkins[0]).toEqual(checkins[1]);
    await page.getByRole('button', { name: 'Finish', exact: true }).click(); await page.getByRole('button', { name: 'Begin', exact: true }).click(); await page.getByRole('button', { name: 'Returning visitor face check-in' }).click();
    await page.getByLabel('I choose local face matching for this check-in.').check();
    await page.evaluate(() => { (window as unknown as { syntheticFaceCamera: { hold: boolean } }).syntheticFaceCamera.hold = true; });
    await page.getByRole('button', { name: 'Start matching camera' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { syntheticFaceCamera: { held: boolean } }).syntheticFaceCamera.held)).toBe(true);
    await page.getByRole('button', { name: 'Cancel and clear face attempt' }).click();
    await page.evaluate(() => { const state = (window as unknown as { syntheticFaceCamera: { hold: boolean; release: () => void } }).syntheticFaceCamera; state.hold = false; state.release(); });
    await expect.poll(() => page.evaluate(() => (window as unknown as { syntheticFaceCamera: { stops: number } }).syntheticFaceCamera.stops)).toBe(3);
    await page.evaluate(() => { (window as unknown as { syntheticFaceCamera: { denied: boolean } }).syntheticFaceCamera.denied = true; });
    await page.getByRole('button', { name: 'Start matching camera' }).click(); await expect(page.getByRole('alert')).toContainText('Camera unavailable');
    await page.getByRole('button', { name: 'Use manual check-in' }).click(); await expect(page.getByRole('heading', { name: 'Manual check-in' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to welcome' }).click(); await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
    await page.getByLabel('Staff password').fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: 'Load face enrollments' }).click();
    await expect(page.getByRole('button', { name: 'Revoke enrollment' })).toBeVisible(); await page.getByRole('button', { name: 'Revoke enrollment' }).click(); await expect(page.getByRole('button', { name: 'Revoke enrollment' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('region', { name: 'Staff face enrollments' })).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await running?.stop(); fixture.dispose(); }
});

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { syntheticJpeg } from '../jpeg-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch, stopChild } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { photoConsentVersion, photoSavedSchema } from '../../packages/contracts/photos.ts';
import { openAttendance } from '../../services/attendance/database.ts';

it('keeps real-process photo uploads bound to visit ownership, staff reads private and withdrawal irreversible without AI', async () => {
  const fixture = await runtimeFixture(); let running: Awaited<ReturnType<typeof launch>> | undefined;
  const password = 'synthetic private photo staff passphrase', base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  const baseHeaders = { origin: base, 'content-type': 'application/json' };
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password); migrateAll(fixture.root, fixture.env); running = await launch('start', fixture.root, fixture.env); await stopChild(running.children.knowledge!);
    const bootstrap = async () => { const result = await fetch(`${base}/api/v1/session`, { method: 'POST', headers: { ...baseHeaders, 'x-kiosk-bootstrap': '1' }, body: '{}' }); const session = await result.json(); return { ...baseHeaders, cookie: result.headers.get('set-cookie')!.split(';')[0]!, 'x-csrf-token': String(session.csrfToken) }; };
    const owner = await bootstrap(), other = await bootstrap(), idempotencyKey = randomUUID();
    const checkin = await fetch(`${base}/api/v1/checkin`, { method: 'POST', headers: owner, body: JSON.stringify({ name: 'Synthetic photo visitor', netId: 'ab123', idempotencyKey }) }); expect(checkin.status).toBe(200); const receipt = await checkin.json();
    const input = { visitId: receipt.visitId, idempotencyKey, consent: true, consentVersion: photoConsentVersion, image: (await syntheticJpeg()).toString('base64') };
    const upload = (headers = owner, body = input) => fetch(`${base}/api/v1/visit-photo`, { method: 'POST', headers, body: JSON.stringify(body) });
    expect((await upload({ ...owner, 'x-csrf-token': 'wrong' })).status).toBe(403);
    expect((await upload(other)).status).toBe(404);
    expect((await fetch(`${fixture.config.urls.attendance}/internal/v1/visit-photo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })).status).toBe(401);
    const savedResponse = await upload(); expect(savedResponse.status).toBe(200); const saved = photoSavedSchema.parse(await savedResponse.json());
    const replayResponse = await upload(); expect(replayResponse.status).toBe(200); expect(photoSavedSchema.parse(await replayResponse.json())).toMatchObject({ photoId: saved.photoId, replayed: true });
    expect((await upload(owner, { ...input, image: (await syntheticJpeg('#f4f1e9')).toString('base64') })).status).toBe(409);
    const photoUrl = `${base}/api/v1/staff/visits/${receipt.visitId}/photo`; expect((await fetch(photoUrl, { headers: owner })).status).toBe(403);
    const login = await fetch(`${base}/api/v1/staff/login`, { method: 'POST', headers: other, body: JSON.stringify({ password }) }); expect(login.status).toBe(200); const staffSession = await login.json();
    const staff = { ...baseHeaders, cookie: login.headers.get('set-cookie')!.split(';')[0]!, 'x-csrf-token': String(staffSession.csrfToken) };
    const photo = await fetch(photoUrl, { headers: staff }); expect(photo.status).toBe(200); expect(photo.headers.get('content-type')).toContain('image/jpeg'); expect(photo.headers.get('cache-control')).toBe('no-store'); expect(Buffer.from(await photo.arrayBuffer()).subarray(0, 2)).toEqual(Buffer.from([255, 216]));
    const removed = await fetch(`${base}/api/v1/visit-photo/remove`, { method: 'POST', headers: owner, body: JSON.stringify({ visitId: input.visitId, idempotencyKey }) }); expect(removed.status).toBe(200); expect((await removed.json()).pendingCleanup).toBe(false);
    expect((await fetch(photoUrl, { headers: staff })).status).toBe(404); expect((await upload()).status).toBe(409);
    const nextKey = randomUUID(), nextVisit = await fetch(`${base}/api/v1/checkin`, { method: 'POST', headers: owner, body: JSON.stringify({ name: 'Synthetic second photo visitor', netId: 'xy456', idempotencyKey: nextKey }) }); const nextReceipt = await nextVisit.json();
    expect((await upload(owner, { ...input, visitId: nextReceipt.visitId, idempotencyKey: nextKey })).status).toBe(200);
    const nextUrl = `${base}/api/v1/staff/visits/${nextReceipt.visitId}/photo`;
    expect((await fetch(nextUrl, { method: 'DELETE', headers: { ...staff, 'x-csrf-token': 'wrong' }, body: '{}' })).status).toBe(403);
    expect((await fetch(nextUrl, { method: 'DELETE', headers: staff, body: '{}' })).status).toBe(200); expect((await fetch(nextUrl, { headers: staff })).status).toBe(404);
    const db = openAttendance(fixture.config.runtime.attendance); expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 2 }); expect(db.prepare('SELECT count(*) AS n FROM visit_photos').get()).toEqual({ n: 0 }); expect(db.prepare('SELECT count(*) AS n FROM photo_cleanup').get()).toEqual({ n: 0 }); db.close();
  } finally { await running?.stop(); fixture.dispose(); }
}, 60000);

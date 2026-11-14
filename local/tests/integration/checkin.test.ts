import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch, stopChild } from '../../scripts/launch.ts';
import { openAttendance } from '../../services/attendance/database.ts';
import { checkinResponseSchema } from '../../packages/contracts/checkin.ts';

it('records/replays one self-reported visit through real processes without knowledge and fails honestly on attendance loss', async () => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  const headers = { origin: base, 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' };
  const payload = { name: 'Synthetic Process Visitor', netId: ' Ab123 ', idempotencyKey: randomUUID() };
  try {
    migrateAll(fixture.root, fixture.env); running = await launch('start', fixture.root, fixture.env);
    await stopChild(running.children.knowledge!);
    const bootstrap = await fetch(`${base}/api/v1/session`, { method: 'POST', headers, body: '{}' });
    const kiosk = await bootstrap.json();
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
    const browser = { ...headers, cookie, 'x-csrf-token': String(kiosk.csrfToken) };
    const post = (body: object, extra: Record<string, string> = {}) => fetch(`${base}/api/v1/checkin`, { method: 'POST', headers: { ...browser, ...extra }, body: JSON.stringify(body) });
    const responses = await Promise.all(Array.from({ length: 4 }, () => post(payload)));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200]);
    const receipts = await Promise.all(responses.map(async response => checkinResponseSchema.parse(await response.json())));
    expect(new Set(receipts.map(receipt => receipt.visitId)).size).toBe(1);
    expect(new Set(receipts.map(receipt => receipt.recordedAt)).size).toBe(1);
    expect(receipts.filter(receipt => !receipt.replayed)).toHaveLength(1);
    expect(receipts.every(receipt => receipt.selfReported)).toBe(true);
    expect((await post({ ...payload, name: 'Changed synthetic visitor' })).status).toBe(409);
    expect((await post({ ...payload, sessionScope: 'c'.repeat(64) })).status).toBe(400);
    expect((await post(payload, { 'x-csrf-token': 'wrong' })).status).toBe(403);
    const reset = await fetch(`${base}/api/v1/session`, { method: 'POST', headers: browser, body: '{}' });
    const fresh = await reset.json(); const freshCookie = reset.headers.get('set-cookie')!.split(';')[0]!;
    expect((await post(payload)).status).toBe(401);
    await stopChild(running.children.attendance!);
    const unavailable = await fetch(`${base}/api/v1/checkin`, { method: 'POST', headers: { ...headers, cookie: freshCookie, 'x-csrf-token': fresh.csrfToken }, body: JSON.stringify({ ...payload, idempotencyKey: randomUUID() }) });
    expect(unavailable.status).toBe(503); expect((await unavailable.json()).error.code).toBe('attendance_unavailable');
    const db = openAttendance(fixture.config.runtime.attendance);
    try { expect(db.prepare('SELECT name, net_id, self_reported FROM visits').all()).toEqual([{ name: 'Synthetic Process Visitor', net_id: 'ab123', self_reported: 1 }]); }
    finally { db.close(); }
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
  } finally { await running?.stop(); fixture.dispose(); }
}, 60000);

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { recordVisit } from '../../services/attendance/visits.ts';
import { historyResponseSchema } from '../../packages/contracts/history.ts';

it('keeps real-process retained history/export staff-only across pages, new arrivals and logout without AI', async () => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const password = 'synthetic history staff passphrase';
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password); migrateAll(fixture.root, fixture.env);
    const at = Date.now();
    for (let index = 0; index < 36; index++) recordVisit(fixture.config.runtime.attendance, { name: index === 0 ? '=SUM(1,1)' : `Synthetic history visitor ${index}`, netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'c'.repeat(64) }, at - index * 1000);
    running = await launch('start', fixture.root, fixture.env);
    expect((await fetch(`${base}/api/v1/staff/visits`)).status).toBe(401);
    expect((await fetch(`${fixture.config.urls.attendance}/internal/v1/visits`)).status).toBe(401);
    const bootstrap = await fetch(`${base}/api/v1/session`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' }, body: '{}' });
    const kiosk = await bootstrap.json(), kioskCookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
    const denied = await fetch(`${base}/api/v1/staff/visits`, { headers: { cookie: kioskCookie, 'x-role': 'staff' } }); expect(denied.status).toBe(403); expect(await denied.text()).not.toContain('Synthetic history visitor');
    const login = await fetch(`${base}/api/v1/staff/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', cookie: kioskCookie, 'x-csrf-token': kiosk.csrfToken }, body: JSON.stringify({ password }) });
    expect(login.status).toBe(200); const staff = await login.json(), cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const headers = { origin: base, 'content-type': 'application/json', cookie, 'x-csrf-token': staff.csrfToken };
    const firstResponse = await fetch(`${base}/api/v1/staff/visits?limit=25`, { headers }); expect(firstResponse.status).toBe(200); const first = historyResponseSchema.parse(await firstResponse.json());
    expect(first.items).toHaveLength(25); expect(first.timeZone).toBe('America/Chicago');
    recordVisit(fixture.config.runtime.attendance, { name: 'Synthetic new arrival', netId: 'xy456', idempotencyKey: randomUUID(), sessionScope: 'd'.repeat(64) });
    const secondResponse = await fetch(`${base}/api/v1/staff/visits?limit=25&cursor=${encodeURIComponent(first.nextCursor!)}`, { headers }); expect(secondResponse.status).toBe(200); const second = historyResponseSchema.parse(await secondResponse.json());
    expect(second.items).toHaveLength(11); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(row => row.visitId)).size).toBe(36);
    expect([...first.items, ...second.items].every(row => row.name !== 'Synthetic new arrival' && row.selfReported === true)).toBe(true);
    expect((await fetch(`${base}/api/v1/staff/visits/export`, { method: 'POST', headers: { ...headers, 'x-csrf-token': 'wrong' }, body: '{}' })).status).toBe(403);
    const exportResponse = await fetch(`${base}/api/v1/staff/visits/export`, { method: 'POST', headers, body: '{}' }); expect(exportResponse.status).toBe(200); expect(exportResponse.headers.get('content-type')).toContain('text/csv');
    const csv = await exportResponse.text(); expect(csv).toContain('"\t=SUM(1,1)"'); expect(csv).toContain('Synthetic new arrival'); expect(csv.trim().split('\r\n')).toHaveLength(38);
    expect((await fetch(`${base}/api/v1/staff/logout`, { method: 'POST', headers, body: '{}' })).status).toBe(200);
    const expired = await fetch(`${base}/api/v1/staff/visits`, { headers }); expect(expired.status).toBe(401); expect(await expired.text()).not.toContain('Synthetic history visitor');
    expect((await fetch(`${fixture.config.urls.attendance}/health/live`)).status).toBe(200);
  } finally { await running?.stop(); fixture.dispose(); }
}, 60000);

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch } from '../../scripts/launch.ts';
import { provisionStaff } from '../../services/gateway/credentials.ts';
import { sessionResponseSchema } from '../../packages/contracts/index.ts';

it('keeps real-process browser authorization in the gateway and invalidates sessions on restart', async () => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const password = 'synthetic process staff passphrase';
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  const headers = { origin: base, 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' };
  try {
    await provisionStaff(path.join(fixture.config.runtime.root, 'gateway'), password);
    migrateAll(fixture.root, fixture.env);
    const databases = ['attendance', 'knowledge'].map(service => path.join(fixture.config.runtime.root, service, `${service}.sqlite`));
    const before = databases.map(file => readFileSync(file));
    running = await launch('start', fixture.root, fixture.env);
    expect((await fetch(`${base}/api/v1/session`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' }, body: '{}' })).status).toBe(403);
    const bootstrap = await fetch(`${base}/api/v1/session`, { method: 'POST', headers, body: '{}' });
    expect(bootstrap.status).toBe(200);
    const kiosk = sessionResponseSchema.parse(await bootstrap.json());
    const kioskCookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
    const login = await fetch(`${base}/api/v1/staff/login`, { method: 'POST', headers: { ...headers, cookie: kioskCookie, 'x-csrf-token': kiosk.csrfToken }, body: JSON.stringify({ password }) });
    expect(login.status).toBe(200);
    const staff = sessionResponseSchema.parse(await login.json());
    expect(staff.role).toBe('staff');
    const staffCookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await fetch(`${base}/api/v1/session`, { headers: { cookie: kioskCookie } })).status).toBe(401);
    expect((await fetch(`${fixture.config.urls.attendance}/health/ready`, { headers: { cookie: staffCookie, 'x-role': 'staff' } })).status).toBe(401);
    expect((await fetch(`${fixture.config.urls.knowledge}/health/ready`, { headers: { cookie: staffCookie, 'x-role': 'staff' } })).status).toBe(401);
    const rejected = await fetch(`${base}/api/v1/staff/logout`, { method: 'POST', headers: { ...headers, cookie: staffCookie, 'x-csrf-token': kiosk.csrfToken }, body: '{}' });
    expect(rejected.status).toBe(403);
    expect((await fetch(`${base}/api/v1/session`, { headers: { cookie: staffCookie } })).status).toBe(200);
    await running.stop(); running = undefined;
    running = await launch('start', fixture.root, fixture.env);
    expect((await fetch(`${base}/api/v1/session`, { headers: { cookie: staffCookie } })).status).toBe(401);
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    for (let i = 0; i < databases.length; i++) expect(readFileSync(databases[i]!)).toEqual(before[i]);
  } finally { await running?.stop(); fixture.dispose(); }
}, 60000);

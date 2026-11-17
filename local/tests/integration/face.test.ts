import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { launch, stopChild } from '../../scripts/launch.ts';

it('keeps ordinary attendance available with an unconfigured or stopped optional face process', async () => {
  const fixture = await runtimeFixture();
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = (reservation.address() as AddressInfo).port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const env = { ...fixture.env, FACE_ENABLED: '1', FACE_PORT: String(port), FACE_URL: `http://127.0.0.1:${port}` };
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${fixture.config.ports.gateway}`;
  try {
    migrateAll(fixture.root, env); running = await launch('start', fixture.root, env);
    expect(running.children.face).toBeDefined();
    const boot = await fetch(`${base}/api/v1/session`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'x-kiosk-bootstrap': '1' }, body: '{}' });
    const session = await boot.json() as { csrfToken: string };
    const headers = { origin: base, 'content-type': 'application/json', cookie: boot.headers.get('set-cookie')!.split(';')[0]!, 'x-csrf-token': session.csrfToken };
    for (const stopped of [false, true]) {
      if (stopped) await stopChild(running.children.face!);
      const capability = await fetch(`${base}/api/v1/face/status`, { headers });
      expect(await capability.json()).toMatchObject({ enabled: true, ready: false });
      const checkin = await fetch(`${base}/api/v1/checkin`, { method: 'POST', headers, body: JSON.stringify({ name: 'Synthetic fallback visitor', netId: 'syntheticfallback', idempotencyKey: randomUUID() }) });
      expect(checkin.status).toBe(200); expect(await checkin.json()).toMatchObject({ selfReported: true, replayed: false });
    }
  } finally { await running?.stop(); fixture.dispose(); }
});

import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../../tests/runtime-fixture.ts';
import { migrate, openAttendance } from './database.ts';
import { recordVisit, retentionMs } from './visits.ts';

it('runs retention explicitly outside cwd and refuses arguments without printing fixture identities', async () => {
  const fixture = await runtimeFixture();
  try {
    migrate(fixture.config.runtime.attendance);
    recordVisit(fixture.config.runtime.attendance, { name: 'Synthetic Cleanup Visitor', netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'b'.repeat(64) }, Date.now() - retentionMs - 60_000);
    const run = (args: string[]) => spawnSync(process.execPath, [path.join(fixture.root, 'services/attendance/cleanup.ts'), ...args], { cwd: tmpdir(), env: fixture.env, encoding: 'utf8', timeout: 10000 });
    const refused = run(['--unsafe']);
    expect(refused.status).toBe(1);
    const result = run([]);
    expect(result.status).toBe(0); expect(result.stdout).toContain('Removed expired attendance visits: 1.');
    expect(result.stdout + result.stderr + refused.stdout + refused.stderr).not.toMatch(/Synthetic Cleanup Visitor|ab123|bbbbbbbb/);
    const db = openAttendance(fixture.config.runtime.attendance);
    expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 0 }); db.close();
  } finally { fixture.dispose(); }
});

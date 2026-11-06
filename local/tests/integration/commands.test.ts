import { fork } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { launch, stopChild } from '../../scripts/launch.ts';
import { migrateAll } from '../../scripts/migrate.ts';

it('starts the development proxy and protects development config files', async () => {
  const fixture = await runtimeFixture();
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    migrateAll(fixture.root, fixture.env);
    running = await launch('dev', fixture.root, fixture.env);
    expect(Object.keys(running.children)).toHaveLength(4);
    const status = await fetch('http://127.0.0.1:5173/api/v1/system/status');
    expect(status.status).toBe(200); expect((await status.json()).state).toBe('degraded');
    expect((await fetch('http://127.0.0.1:5173/src/main.tsx')).status).toBe(200);
    expect((await fetch('http://127.0.0.1:5173/', { headers: { origin: 'https://evil.invalid' } })).status).toBe(403);
    const envPath = fixture.root.replaceAll('\\', '/');
    expect((await fetch(`http://127.0.0.1:5173/@fs/${envPath}/.env`)).status).toBeGreaterThanOrEqual(400);
  } finally { await running?.stop(); fixture.dispose(); }
}, 60000);

it('shuts down the CLI launcher and all owned services through Windows IPC', async () => {
  const fixture = await runtimeFixture();
  migrateAll(fixture.root, fixture.env);
  const child = fork(path.join(fixture.root, 'scripts/launch.ts'), ['start'], { cwd: fixture.root, env: fixture.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Launcher startup timed out')), 20000);
      const exit = () => { clearTimeout(timer); reject(new Error('Launcher exited before startup')); };
      child.once('exit', exit);
      child.stdout!.on('data', chunk => { if (String(chunk).includes('Makerspace running')) { clearTimeout(timer); child.removeListener('exit', exit); resolve(); } });
    });
    await stopChild(child);
    expect(child.exitCode).toBe(0);
    for (const service of ['gateway', 'attendance', 'knowledge'] as const) await expect(fetch(`http://127.0.0.1:${fixture.config.ports[service]}/health/live`)).rejects.toThrow();
  } finally { await stopChild(child); fixture.dispose(); }
}, 60000);

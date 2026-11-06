import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { launch, stopChild } from '../../scripts/launch.ts';
import { migrateAll } from '../../scripts/migrate.ts';
import { diagnose } from '../../scripts/doctor.ts';
import { systemStatusSchema } from '../../packages/contracts/index.ts';

it('runs independent Windows-compatible processes, isolates DBs, handles failures and restarts', async () => {
  const fixture = await runtimeFixture();
  const { config, env, root } = fixture;
  let model = true;
  const requests: string[] = [];
  const ollama = createServer((req, res) => {
    requests.push(req.url!); res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ models: model ? [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] : [] }));
  });
  await new Promise<void>(resolve => ollama.listen(Number(new URL(config.urls.ollama).port), '127.0.0.1', resolve));
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  const base = `http://127.0.0.1:${config.ports.gateway}`;
  const status = async () => systemStatusSchema.parse(await (await fetch(`${base}/api/v1/system/status`)).json());
  const refresh = async () => { await delay(5100); return status(); };
  try {
    migrateAll(root, env);
    const aBefore = readFileSync(path.join(config.runtime.attendance, 'attendance.sqlite'));
    migrateAll(root, env);
    expect(readFileSync(path.join(config.runtime.attendance, 'attendance.sqlite'))).toEqual(aBefore);
    expect(readdirSync(config.runtime.attendance).filter(name => name.endsWith('.sqlite'))).toEqual(['attendance.sqlite']);
    expect(readdirSync(config.runtime.knowledge).filter(name => name.endsWith('.sqlite'))).toEqual(['knowledge.sqlite']);
    running = await launch('start', root, env);
    expect(new Set(Object.values(running.children).map(child => child.pid)).size).toBe(3);
    expect(Object.values(running.children).every(child => child.pid !== process.pid)).toBe(true);
    expect((await status()).state).toBe('ready'); expect((await diagnose(config)).state).toBe('ready');
    expect((await fetch(`${config.urls.attendance}/health/ready`)).status).toBe(401);
    expect((await fetch(`${base}/`, { headers: { origin: 'https://evil.invalid' } })).status).toBe(403);
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base, { headers: { host: 'evil.invalid' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    expect(hostileHostStatus).toBe(403);
    model = false; expect((await refresh()).components.ollama.code).toBe('model_missing');
    ollama.closeAllConnections(); await new Promise<void>(resolve => ollama.close(() => resolve()));
    const degraded = await refresh(); expect(degraded.state).toBe('degraded'); expect(degraded.components.knowledge.ready).toBe(true); expect(degraded.components.attendance.ready).toBe(true);
    await stopChild(running.children.attendance!);
    expect((await refresh()).state).toBe('unavailable'); expect((await fetch(base)).status).toBe(200);
    const replacement = fork(path.join(root, 'services/attendance/index.ts'), [], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    running.children.attendance = replacement;
    expect((await refresh()).state).toBe('degraded');
    expect(requests.every(url => url === '/api/tags')).toBe(true);
    await running.stop(); running = undefined;
    await expect(fetch(`${base}/health/live`)).rejects.toThrow();
    running = await launch('start', root, env); expect((await status()).state).toBe('degraded');
    await expect(launch('start', root, env)).rejects.toThrow('occupied');
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
  } finally { await running?.stop(); ollama.closeAllConnections(); await new Promise<void>(resolve => ollama.close(() => resolve())); fixture.dispose(); }
}, 90000);

import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfiguration, workspaceRoot } from '../packages/config/index.mjs';

export async function checkPorts(ports: number[]) {
  for (const port of ports) {
    await new Promise<void>((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error(`Port ${port} is occupied or unavailable. Stop its owner or change the configured port.`)));
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(error => error ? reject(error) : resolve()));
    });
  }
}
export async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => child.kill(), 5000);
    child.once('exit', finish);
    if (child.connected) child.send('shutdown', error => { if (error) child.kill(); });
    else child.kill();
  });
}
export async function launch(mode: 'start' | 'dev', root = workspaceRoot, environment = process.env, signal?: AbortSignal) {
  const config = loadConfiguration(root, environment);
  const ports = [config.ports.gateway, config.ports.attendance, config.ports.knowledge, ...(mode === 'dev' ? [5173] : [])];
  await checkPorts(ports);
  if (mode === 'start' && !existsSync(path.join(root, 'apps/kiosk/dist/index.html'))) throw new Error('Kiosk build missing. Run pnpm build.');
  const children: Record<string, ChildProcess> = {};
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= Promise.all(Object.values(children).map(stopChild)).then(() => undefined);
  signal?.addEventListener('abort', () => { void stop(); }, { once: true });
  try {
    if (signal?.aborted) throw new Error('Startup cancelled.');
    for (const name of ['attendance', 'knowledge', 'gateway', ...(mode === 'dev' ? ['kiosk'] : [])]) {
      const file = name === 'kiosk' ? 'scripts/vite.ts' : `services/${name}/index.ts`;
      const child = fork(path.join(root, file), name === 'gateway' && mode === 'dev' ? ['--dev'] : [], { cwd: root, env: environment, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      children[name] = child;
      child.on('error', () => { console.error(`${name} process failed to start.`); });
      child.on('exit', () => { if (!stopping) console.error(`${name} stopped. Other services remain running; restart the service or launcher.`); });
    }
    for (const port of ports) {
      let available = false;
      for (let attempt = 0; attempt < 60 && !available; attempt++) {
        if (signal?.aborted) throw new Error('Startup cancelled.');
        if (Object.values(children).some(child => child.exitCode !== null || child.signalCode !== null)) throw new Error('A service exited during startup.');
        try {
          const response = await fetch(`http://127.0.0.1:${port}${port === 5173 ? '/' : '/health/live'}`, { signal: AbortSignal.timeout(500), redirect: 'error' });
          await response.body?.cancel(); available = response.ok;
        } catch { /* The process may still be binding its listener. */ }
        if (!available) await delay(100);
      }
      if (!available) throw new Error(`Service on port ${port} did not become live.`);
    }
    return { children, stop, config };
  } catch (error) { await stop(); throw error; }
}
if (import.meta.main) {
  try {
    const mode = process.argv[2];
    if ((mode !== 'start' && mode !== 'dev') || process.argv.length !== 3) throw new Error('Usage: pnpm start or pnpm dev');
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
    process.on('message', message => { if (message === 'shutdown') controller.abort(); });
    const running = await launch(mode, workspaceRoot, process.env, controller.signal);
    const stop = () => { void running.stop().finally(() => { if (process.connected) process.disconnect(); }); };
    controller.signal.addEventListener('abort', stop, { once: true });
    if (controller.signal.aborted) stop();
    console.log(`Makerspace running at http://127.0.0.1:${mode === 'dev' ? 5173 : running.config.ports.gateway}. Ctrl+C stops owned processes.`);
  } catch (error) {
    console.error(error instanceof Error && /^(Port \d+|Kiosk build missing|A service exited|Service on port|Usage:)/.test(error.message) ? error.message : 'Startup failed. Run config:check and check local prerequisites.');
    process.exitCode = 1; if (process.connected) process.disconnect();
  }
}

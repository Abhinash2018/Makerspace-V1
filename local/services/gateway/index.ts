import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema, systemStatusSchema } from '../../packages/contracts/index.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { makeServer, serve } from '../../packages/http/server.ts';
import { createStatus } from './status.ts';
import { registerAuth } from './auth.ts';
import { registerCheckin } from './checkin.ts';
import { registerQuestions } from './questions.ts';
import { registerStaffHistory } from './history.ts';

const dist = fileURLToPath(new URL('../../apps/kiosk/dist/', import.meta.url));
export function createGateway(config: Configuration, options: { assetDir?: string; dev?: boolean } = {}) {
  const origin = `http://127.0.0.1:${config.ports.gateway}`;
  const origins = [origin, ...(options.dev ? ['http://127.0.0.1:5173'] : [])];
  const app = makeServer({ service: 'gateway', port: config.ports.gateway, origins, logLevel: config.logLevel });
  const auth = registerAuth(app, { directory: path.join(config.runtime.root, 'gateway'), origins });
  registerCheckin(app, config, auth);
  registerQuestions(app, config, auth);
  registerStaffHistory(app, config, auth);
  // Only build-owned files are registered as routes. No arbitrary path lookup.
  const assets = new Map<string, { body: Buffer; type: string }>();
  const directory = options.assetDir ?? dist;
  const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };
  try {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('Invalid assets');
    const assetPath = path.join(directory, 'assets');
    if (!lstatSync(assetPath).isDirectory() || lstatSync(assetPath).isSymbolicLink()) throw new Error('Invalid assets');
    const files = ['index.html', ...readdirSync(assetPath).filter(name => /^[a-zA-Z0-9_-]+\.(?:js|css)$/.test(name)).map(name => `assets/${name}`)];
    for (const file of files) {
      const target = path.join(directory, file), stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('Invalid assets');
      assets.set(file === 'index.html' ? '/' : `/${file}`, { body: readFileSync(target), type: types[path.extname(file)]! });
    }
    if (!files.some(file => file.endsWith('.js'))) assets.clear();
  } catch { assets.clear(); }
  const status = createStatus(config, () => !!options.dev || assets.has('/'));
  app.get('/health/live', req => liveSchema.parse({ requestId: req.id, service: 'gateway', live: true }));
  app.get('/api/v1/system/status', async req => systemStatusSchema.parse(await status(req.id)));
  app.get('/health/ready', async (req, reply) => {
    const current = await status(req.id);
    const ready = ['gateway', 'attendance', 'knowledge'].every(key => current.components[key as keyof typeof current.components].ready);
    return reply.code(ready ? 200 : 503).send(readySchema.parse({ requestId: req.id, service: 'gateway', ready, code: ready ? 'ready' : 'dependency_unavailable' }));
  });
  for (const [url, asset] of assets) app.get(url, (_req, reply) => reply
    .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    .type(asset.type).send(asset.body));
  return app;
}
if (import.meta.main) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--dev')) throw new Error('Unknown option');
    const config = loadConfiguration();
    await serve(createGateway(config, { dev: process.argv.includes('--dev') }), 'gateway', config.ports.gateway, config.logLevel);
  } catch { console.error('Gateway configuration/startup failed. Run config:check.'); process.exitCode = 1; }
}

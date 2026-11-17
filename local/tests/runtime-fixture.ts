import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaults, parseConfiguration, workspaceRoot } from '../packages/config/index.mjs';
import { setupLocal } from '../scripts/setup-local.mjs';

export async function runtimeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-runtime-test-'));
  const dispose = () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('ms000-runtime-test-'));
    rmSync(root, { recursive: true, force: true });
  };
  try {
    for (const item of ['package.json', '.env.example', 'tsconfig.json', 'tsconfig.base.json', 'packages', 'services', 'scripts', 'apps/kiosk']) {
      cpSync(path.join(workspaceRoot, item), path.join(root, item), { recursive: true, filter: source => path.basename(source) !== 'node_modules' && !source.endsWith('.test.ts') });
    }
    for (const item of ['', 'packages/contracts', 'packages/http', 'services/attendance', 'services/knowledge', 'services/face', 'apps/kiosk']) {
      const source = path.join(workspaceRoot, item, 'node_modules');
      if (existsSync(source)) symlinkSync(source, path.join(root, item, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    setupLocal(root);
    const reservations = Array.from({ length: 4 }, () => createServer());
    let ports: number[];
    try {
      await Promise.all(reservations.map(server => new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); })));
      ports = reservations.map(server => (server.address() as AddressInfo).port);
    } finally { await Promise.all(reservations.map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
    const [gateway, attendance, knowledge, ollama] = ports;
    const env = { ...process.env, ...defaults, GATEWAY_PORT: String(gateway), ATTENDANCE_PORT: String(attendance), KNOWLEDGE_PORT: String(knowledge), ATTENDANCE_URL: `http://127.0.0.1:${attendance}`, KNOWLEDGE_URL: `http://127.0.0.1:${knowledge}`, OLLAMA_BASE_URL: `http://127.0.0.1:${ollama}`, OLLAMA_CHAT_MODEL: 'synthetic:test', INTERNAL_SERVICE_TOKEN: 'b'.repeat(64), LOG_LEVEL: 'silent' };
    return { root, env, config: parseConfiguration(env, root), dispose };
  } catch (error) { dispose(); throw error; }
}

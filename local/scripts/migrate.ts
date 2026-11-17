import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfiguration, workspaceRoot } from '../packages/config/index.mjs';

// Invoke each owner's command; orchestration never imports a database module.
export function migrateAll(root = workspaceRoot, env = process.env) {
  for (const service of ['attendance', 'knowledge', ...(loadConfiguration(root, env).faceEnabled ? ['face'] : [])]) {
    const result = spawnSync(process.execPath, [path.join(root, `services/${service}/database.ts`), '--migrate'], { cwd: root, env, stdio: 'inherit', timeout: 30000 });
    if (result.error || result.status !== 0) throw new Error('Service migration failed. Check configuration and database access.');
  }
}
if (import.meta.main) {
  try { migrateAll(); }
  catch { console.error('Service migration failed. Check configuration and database access.'); process.exitCode = 1; }
}

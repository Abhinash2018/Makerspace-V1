import { loadConfiguration } from '../../packages/config/index.mjs';
import { probeModel } from './ollama.ts';

// Explicit developer command only; never called by a health route or launcher.
export async function runProbe() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--cpu')) throw new Error('Unexpected arguments');
  const config = loadConfiguration();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const result = await probeModel({ baseUrl: config.urls.ollama, model: config.model }, { signal: controller.signal, cpuOnly: args[0] === '--cpu' });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
if (import.meta.main) {
  try { await runProbe(); }
  catch { console.error('Probe setup failed. Run config:check; usage: pnpm ollama:probe [--cpu].'); process.exitCode = 1; }
}

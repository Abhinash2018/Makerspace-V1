import { randomUUID } from 'node:crypto';
import { loadConfiguration } from '../packages/config/index.mjs';
import type { Configuration } from '../packages/contracts/index.ts';
import { systemStatusSchema } from '../packages/contracts/index.ts';
import { boundedJson } from '../packages/http/client.ts';

export async function diagnose(config: Configuration) {
  const requestId = randomUUID();
  try {
    const status = systemStatusSchema.parse(await boundedJson(`http://127.0.0.1:${config.ports.gateway}/api/v1/system/status`, { timeoutMs: 3000, headers: { 'x-request-id': requestId } }));
    if (status.requestId !== requestId) throw new Error('Invalid response');
    return { configuration: 'valid', state: status.state, components: status.components };
  } catch { return { configuration: 'valid', state: 'unavailable', code: 'gateway_unavailable' }; }
}
if (import.meta.main) {
  try {
    const result = await diagnose(loadConfiguration());
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.state === 'ready' ? 0 : 1;
  } catch { console.error('Configuration invalid. Run config:check.'); process.exitCode = 1; }
}

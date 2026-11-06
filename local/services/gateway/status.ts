import { randomUUID } from 'node:crypto';
import { boundedJson } from '../../packages/http/client.ts';
import { readySchema, modelStatusSchema } from '../../packages/contracts/index.ts';
import type { Configuration, Component, SystemStatus } from '../../packages/contracts/index.ts';

export function createStatus(config: Configuration, assetsReady: () => boolean, now = Date.now) {
  type Snapshot = Omit<SystemStatus, 'requestId'>;
  let cached: Snapshot | undefined;
  let expires = 0;
  let pending: Promise<Snapshot> | undefined;
  const unavailable: Component = { ready: false, code: 'dependency_unavailable' };
  async function readiness(service: 'attendance' | 'knowledge'): Promise<Component> {
    const requestId = randomUUID();
    try {
      const data = readySchema.parse(await boundedJson(`${config.urls[service]}/health/ready`, {
        headers: { 'x-internal-service-token': config.serviceToken, 'x-request-id': requestId },
      }));
      if (data.service !== service || data.requestId !== requestId || data.ready !== (data.code === 'ready')) return unavailable;
      return { ready: data.ready, code: data.code };
    } catch { return unavailable; }
  }
  async function model(): Promise<Component> {
    const requestId = randomUUID();
    try {
      const data = modelStatusSchema.parse(await boundedJson(`${config.urls.knowledge}/internal/v1/model-status`, {
        headers: { 'x-internal-service-token': config.serviceToken, 'x-request-id': requestId },
      }));
      if (data.requestId !== requestId || data.modelAvailable !== (data.code === 'ready') || (data.modelAvailable && !data.runtimeAvailable)) return unavailable;
      return { ready: data.modelAvailable, code: data.code };
    } catch { return unavailable; }
  }
  async function refresh(): Promise<Snapshot> {
    const [attendance, knowledge, ollama] = await Promise.all([readiness('attendance'), readiness('knowledge'), model()]);
    const gateway: Component = assetsReady() ? { ready: true, code: 'ready' } : { ready: false, code: 'ui_missing' };
    return { apiVersion: 1, state: !gateway.ready || !attendance.ready || !knowledge.ready ? 'unavailable' : ollama.ready ? 'ready' : 'degraded', components: { gateway, attendance, knowledge, ollama } };
  }
  return async (requestId: string): Promise<SystemStatus> => {
    if (!cached || now() >= expires) {
      pending ??= refresh().then(value => { cached = value; expires = now() + 5000; return value; }).finally(() => { pending = undefined; });
      await pending;
    }
    return { ...cached!, requestId };
  };
}

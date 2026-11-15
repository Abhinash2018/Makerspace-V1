import { loadConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema, modelStatusSchema } from '../../packages/contracts/index.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { makeServer, serve } from '../../packages/http/server.ts';
import { readiness } from './database.ts';
import { inspectModel } from './ollama.ts';
import { loadEmbeddingSettings } from './settings.ts';

export function createKnowledge(config: Configuration) {
  loadEmbeddingSettings(config.runtime.knowledge);
  const app = makeServer({ service: 'knowledge', port: config.ports.knowledge, token: config.serviceToken, logLevel: config.logLevel });
  app.get('/health/live', req => liveSchema.parse({ service: 'knowledge', live: true, requestId: req.id }));
  app.get('/health/ready', (req, reply) => {
    const status = readiness(config.runtime.knowledge);
    return reply.code(status.ready ? 200 : 503).send(readySchema.parse({ service: 'knowledge', requestId: req.id, ...status }));
  });
  app.get('/internal/v1/model-status', async (req, reply) => {
    const controller = new AbortController();
    const disconnect = () => { if (!reply.raw.writableEnded) controller.abort(); };
    reply.raw.once('close', disconnect);
    try {
      const { runtimeAvailable, modelAvailable, code } = await inspectModel({ baseUrl: config.urls.ollama, model: config.model }, { signal: controller.signal });
      return modelStatusSchema.parse({ requestId: req.id, runtimeAvailable, modelAvailable, code });
    } finally { reply.raw.removeListener('close', disconnect); }
  });
  return app;
}
if (import.meta.main) {
  try {
    const config = loadConfiguration();
    await serve(createKnowledge(config), 'knowledge', config.ports.knowledge, config.logLevel);
  } catch { console.error('Knowledge configuration/startup failed. Run config:check.'); process.exitCode = 1; }
}

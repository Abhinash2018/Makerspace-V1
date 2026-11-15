import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { errorSchema } from '../../packages/contracts/index.ts';
import { answerResponseSchema, questionSchema } from '../../packages/contracts/answers.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody } from '../../packages/observability/index.ts';
import type { registerAuth } from './auth.ts';
import { createLimit } from './limits.ts';

export function registerQuestions(app: FastifyInstance, config: Configuration, auth: ReturnType<typeof registerAuth>) {
  const limit = createLimit(6, 60000);
  app.post('/api/v1/question', async (req, reply) => {
    if (!auth.authorize(req, reply, 'kiosk')) return reply;
    const attempt = limit();
    if (!attempt.allowed) return reply.header('Retry-After', attempt.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    req.raw.socket?.setTimeout?.(100000);
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const response = await boundedResponse(`${config.urls.knowledge}/internal/v1/answers`, {
        method: 'POST', signal: controller.signal, timeoutMs: 95000, maxBytes: 16384, acceptStatuses: [400, 429, 503],
        headers: { 'content-type': 'application/json', 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken }, body: JSON.stringify(parsed.data),
      });
      if (response.statusCode === 200) {
        const result = answerResponseSchema.parse(response.body);
        if (result.requestId !== req.id) throw new Error('Invalid response.');
        // Model work can outlast a rotated/expired session; do not revive it.
        if (!auth.authorize(req, reply, 'kiosk')) return reply;
        auth.touch(req); return reply.send(result);
      }
      const failure = errorSchema.parse(response.body);
      const expected = response.statusCode === 400 ? 'bad_request' : response.statusCode === 429 ? 'rate_limited' : 'knowledge_unavailable';
      if (failure.error.requestId !== req.id || failure.error.code !== expected) throw new Error('Invalid response.');
      if (!auth.authorize(req, reply, 'kiosk')) return reply;
      if (response.statusCode === 429) reply.header('Retry-After', 3);
      return reply.code(response.statusCode).send(errorBody(expected, req.id));
    } catch { return reply.code(503).send(errorBody('knowledge_unavailable', req.id)); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
}

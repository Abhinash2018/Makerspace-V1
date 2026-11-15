import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { answerResponseSchema, questionSchema } from '../../packages/contracts/answers.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { AnswerBusy, createAnswerEngine } from './answers.ts';

export function registerAnswers(app: FastifyInstance, config: Configuration) {
  const answer = createAnswerEngine({ directory: config.runtime.knowledge, baseUrl: config.urls.ollama, model: config.model });
  app.post('/internal/v1/answers', async (req, reply) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    // Only this bounded long-running route extends the default idle socket limit.
    req.raw.socket?.setTimeout?.(95000);
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try { return reply.send(answerResponseSchema.parse({ requestId: req.id, ...await answer(parsed.data, controller.signal) })); }
    catch (error) {
      if (error instanceof AnswerBusy) return reply.header('Retry-After', 3).code(429).send(errorBody('rate_limited', req.id));
      return reply.code(503).send(errorBody('knowledge_unavailable', req.id));
    } finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
}

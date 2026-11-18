import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { chatRequestSchema, chatResponseSchema } from '../../packages/contracts/chat.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { AnswerBusy } from './answers.ts';
import { createChatEngine } from './rag.ts';

export function registerChat(app: FastifyInstance, config: Configuration) {
  const chat = createChatEngine({ directory: config.runtime.knowledge, baseUrl: config.urls.ollama, model: config.model });
  app.post('/internal/v1/chat', { bodyLimit: 16384 }, async (req, reply) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    req.raw.socket?.setTimeout?.(115000);
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try { return reply.send(chatResponseSchema.parse({ requestId: req.id, ...await chat(parsed.data, controller.signal) })); }
    catch (error) {
      if (error instanceof AnswerBusy) return reply.header('Retry-After', 3).code(429).send(errorBody('rate_limited', req.id));
      return reply.code(503).send(errorBody('knowledge_unavailable', req.id));
    } finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
}

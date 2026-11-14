import { createHash } from 'node:crypto';
import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { errorSchema } from '../../packages/contracts/index.ts';
import { checkinRequestSchema, checkinResponseSchema } from '../../packages/contracts/checkin.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody } from '../../packages/observability/index.ts';
import type { registerAuth } from './auth.ts';
import { createLimit } from './limits.ts';

export function registerCheckin(app: FastifyInstance, config: Configuration, auth: ReturnType<typeof registerAuth>) {
  const limit = createLimit(10, 60_000);
  app.post('/api/v1/checkin', async (req, reply) => {
    const session = auth.authorize(req, reply, 'kiosk');
    if (!session) return reply;
    const attempt = limit();
    if (!attempt.allowed) return reply.header('Retry-After', attempt.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    const parsed = checkinRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    const controller = new AbortController();
    const abort = () => controller.abort();
    const disconnected = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnected);
    try {
      const sessionScope = createHash('sha256').update(session.csrfToken).digest('hex');
      const response = await boundedResponse(`${config.urls.attendance}/internal/v1/visits`, {
        method: 'POST', signal: controller.signal, timeoutMs: 2000, maxBytes: 4096, acceptStatuses: [400, 409, 503],
        headers: { 'content-type': 'application/json', 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken },
        body: JSON.stringify({ ...parsed.data, sessionScope }),
      });
      if (response.statusCode === 200) {
        const receipt = checkinResponseSchema.parse(response.body);
        if (receipt.requestId !== req.id) throw new Error('Invalid response.');
        auth.touch(req);
        return reply.send(receipt);
      }
      const failure = errorSchema.parse(response.body);
      const expected = response.statusCode === 409 ? 'idempotency_conflict' : response.statusCode === 400 ? 'bad_request' : 'attendance_unavailable';
      if (failure.error.requestId !== req.id || failure.error.code !== expected) throw new Error('Invalid response.');
      return reply.code(response.statusCode).send(errorBody(expected, req.id));
    } catch { return reply.code(503).send(errorBody('attendance_unavailable', req.id)); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnected); }
  });
}

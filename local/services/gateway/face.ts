import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { errorSchema, readySchema, sessionRequestSchema } from '../../packages/contracts/index.ts';
import { faceEnrollSchema, faceMatchSchema, faceCheckinSchema, faceWithdrawSchema, faceEnrollmentSchema, faceMatchResponseSchema, faceRemovedSchema, faceListQuerySchema, faceListSchema, faceStatusSchema } from '../../packages/contracts/face.ts';
import { checkinResponseSchema } from '../../packages/contracts/checkin.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody } from '../../packages/observability/index.ts';
import type { registerAuth } from './auth.ts';
import { createLimit } from './limits.ts';

export function registerFace(app: FastifyInstance, config: Configuration, auth: ReturnType<typeof registerAuth>) {
  const operations = createLimit(6, 60000), withdrawals = createLimit(12, 60000), staff = createLimit(30, 60000);
  app.get('/api/v1/face/status', async (req, reply) => {
    if (!auth.authorize(req, reply)) return reply;
    let ready = false;
    if (config.faceEnabled) try {
      const upstream = await boundedResponse(`${config.urls.face}/health/ready`, { timeoutMs: 1500, maxBytes: 4096, headers: { 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken } });
      const value = readySchema.parse(upstream.body); ready = value.requestId === req.id && value.service === 'face' && value.ready;
    } catch { /* Ordinary kiosk functions remain available. */ }
    if (!auth.authorize(req, reply)) return reply;
    return faceStatusSchema.parse({ requestId: req.id, enabled: config.faceEnabled, ready });
  });
  async function request(req: FastifyRequest, reply: FastifyReply, action: 'enroll' | 'match' | 'withdraw' | 'checkin' | 'list' | 'remove') {
    const role = action === 'list' || action === 'remove' ? 'staff' : 'kiosk';
    const session = auth.authorize(req, reply, role); if (!session) return reply;
    if (!config.faceEnabled && action !== 'checkin') return reply.code(503).send(errorBody('face_unavailable', req.id));
    const allowed = (role === 'staff' ? staff : action === 'withdraw' ? withdrawals : operations)();
    if (!allowed.allowed) return reply.header('Retry-After', allowed.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    let payload: unknown, destination: string;
    const scope = createHash('sha256').update(session.csrfToken).digest('hex');
    if (action === 'list') {
      const query = faceListQuerySchema.safeParse(req.query); if (!query.success) return reply.code(400).send(errorBody('bad_request', req.id));
      destination = `${config.urls.face}/internal/v1/face/enrollments${query.data.after ? `?after=${query.data.after}` : ''}`;
    } else if (action === 'remove') {
      const params = faceListQuerySchema.safeParse({ after: (req.params as { id: string }).id });
      if (!params.success || !sessionRequestSchema.safeParse(req.body).success) return reply.code(400).send(errorBody('bad_request', req.id));
      destination = `${config.urls.face}/internal/v1/face/enrollments/${params.data.after}`;
    } else {
      const parsed = (action === 'enroll' ? faceEnrollSchema : action === 'match' ? faceMatchSchema : action === 'checkin' ? faceCheckinSchema : faceWithdrawSchema).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
      payload = { ...parsed.data, ...('code' in parsed.data ? {} : { sessionScope: scope }) };
      destination = `${action === 'checkin' ? config.urls.attendance : config.urls.face}/internal/v1/face/${action}`;
    }
    const controller = new AbortController(), abort = () => controller.abort(), disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.socket?.setTimeout?.(20000); req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const upstream = await boundedResponse(destination, { method: action === 'list' ? 'GET' : action === 'remove' ? 'DELETE' : 'POST', timeoutMs: action === 'enroll' || action === 'match' ? 18000 : action === 'checkin' ? 4000 : 2000, maxBytes: action === 'list' ? 32768 : 4096, signal: controller.signal, acceptStatuses: [400, 404, 409, 429, 503],
        headers: { 'content-type': 'application/json', 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      if (!auth.authorize(req, reply, role)) return reply;
      if (upstream.statusCode === 200) {
        const schema = action === 'enroll' ? faceEnrollmentSchema : action === 'match' ? faceMatchResponseSchema : action === 'checkin' ? checkinResponseSchema : action === 'list' ? faceListSchema : faceRemovedSchema;
        const result = schema.parse(upstream.body); if (result.requestId !== req.id) throw new Error();
        auth.touch(req); return reply.send(result);
      }
      const failure = errorSchema.parse(upstream.body);
      const expected = upstream.statusCode === 400 ? ['bad_request', 'invalid_face'] : upstream.statusCode === 404 ? ['face_not_found'] : upstream.statusCode === 409 ? ['face_conflict', 'idempotency_conflict'] : upstream.statusCode === 429 ? ['rate_limited'] : ['face_unavailable'];
      if (failure.error.requestId !== req.id || !expected.includes(failure.error.code)) throw new Error();
      if (upstream.statusCode === 429) reply.header('Retry-After', 10);
      return reply.code(upstream.statusCode).send(errorBody(failure.error.code, req.id));
    } catch { return reply.code(503).send(errorBody('face_unavailable', req.id)); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  }
  for (const action of ['enroll', 'match', 'withdraw', 'checkin'] as const) app.post(`/api/v1/face/${action}`, { bodyLimit: action === 'enroll' || action === 'match' ? 750000 : 8192 }, (req, reply) => request(req, reply, action));
  app.get('/api/v1/staff/face/enrollments', (req, reply) => request(req, reply, 'list'));
  app.delete('/api/v1/staff/face/enrollments/:id', (req, reply) => request(req, reply, 'remove'));
}

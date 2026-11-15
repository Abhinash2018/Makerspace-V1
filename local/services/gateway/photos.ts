import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { errorSchema, sessionRequestSchema } from '../../packages/contracts/index.ts';
import { photoParamsSchema, photoRemovedSchema, photoSavedSchema, photoUploadSchema, privatePhotoSchema, visitPhotoProofSchema } from '../../packages/contracts/photos.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody } from '../../packages/observability/index.ts';
import type { registerAuth } from './auth.ts';
import { createLimit } from './limits.ts';

export function registerPhotos(app: FastifyInstance, config: Configuration, auth: ReturnType<typeof registerAuth>) {
  const uploadLimit = createLimit(6, 60000), readLimit = createLimit(60, 60000), removeLimit = createLimit(10, 60000);
  async function request(req: FastifyRequest, reply: FastifyReply, action: 'upload' | 'read' | 'withdraw' | 'remove') {
    const role = action === 'read' || action === 'remove' ? 'staff' : 'kiosk';
    const session = auth.authorize(req, reply, role); if (!session) return reply;
    const attempt = (action === 'upload' ? uploadLimit : action === 'read' ? readLimit : removeLimit)();
    if (!attempt.allowed) return reply.header('Retry-After', attempt.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    const params = action === 'read' || action === 'remove' ? photoParamsSchema.safeParse(req.params) : null;
    if (params && !params.success) return reply.code(400).send(errorBody('bad_request', req.id));
    let visitId = params?.success ? params.data.visitId : null;
    let payload: unknown, path: string;
    if (action === 'read') path = `/internal/v1/visits/${visitId}/photo`;
    else if (action === 'remove') {
      if (!sessionRequestSchema.safeParse(req.body).success) return reply.code(400).send(errorBody('bad_request', req.id));
      path = '/internal/v1/visit-photo/remove'; payload = { actor: 'staff', visitId };
    } else {
      const parsed = action === 'upload' ? photoUploadSchema.safeParse(req.body) : visitPhotoProofSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
      visitId = parsed.data.visitId;
      const sessionScope = createHash('sha256').update(session.csrfToken).digest('hex');
      payload = { ...parsed.data, sessionScope, ...(action === 'withdraw' ? { actor: 'visitor' } : {}) };
      path = action === 'upload' ? '/internal/v1/visit-photo' : '/internal/v1/visit-photo/remove';
    }
    if (action === 'upload') req.raw.socket?.setTimeout?.(10000);
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const response = await boundedResponse(`${config.urls.attendance}${path}`, { method: action === 'read' ? 'GET' : 'POST', signal: controller.signal,
        timeoutMs: action === 'upload' ? 8000 : 2000, maxBytes: action === 'read' ? 524288 : 4096, acceptStatuses: [400, 404, 409, 429, 503],
        headers: { 'content-type': 'application/json', 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken }, ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (response.statusCode === 200) {
        if (action === 'read') {
          const value = privatePhotoSchema.parse(response.body), bytes = Buffer.from(value.image, 'base64');
          if (value.requestId !== req.id || value.visitId !== visitId || bytes.length !== value.byteLength || bytes[0] !== 255 || bytes[1] !== 216 || createHash('sha256').update(bytes).digest('hex') !== value.sha256) throw new Error('Invalid response.');
          if (!auth.authorize(req, reply, role)) return reply;
          auth.touch(req); return reply.type('image/jpeg').header('Content-Disposition', 'inline; filename="visit-photo.jpg"').send(bytes);
        }
        const value = action === 'upload' ? photoSavedSchema.parse(response.body) : photoRemovedSchema.parse(response.body);
        if (value.requestId !== req.id || ('visitId' in value && value.visitId !== visitId)) throw new Error('Invalid response.');
        if (!auth.authorize(req, reply, role)) return reply;
        auth.touch(req); return reply.send(value);
      }
      const failure = errorSchema.parse(response.body);
      const expected = response.statusCode === 400 ? ['bad_request', 'invalid_photo'] : response.statusCode === 404 ? ['photo_not_found'] : response.statusCode === 409 ? ['photo_conflict'] : response.statusCode === 429 ? ['rate_limited'] : ['photo_unavailable'];
      if (failure.error.requestId !== req.id || !expected.includes(failure.error.code)) throw new Error('Invalid response.');
      if (!auth.authorize(req, reply, role)) return reply;
      if (response.statusCode === 429) reply.header('Retry-After', 2);
      return reply.code(response.statusCode).send(errorBody(failure.error.code, req.id));
    } catch { return reply.code(503).send(errorBody('photo_unavailable', req.id)); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  }
  app.post('/api/v1/visit-photo', { bodyLimit: 750000 }, (req, reply) => request(req, reply, 'upload'));
  app.post('/api/v1/visit-photo/remove', (req, reply) => request(req, reply, 'withdraw'));
  app.get('/api/v1/staff/visits/:visitId/photo', (req, reply) => request(req, reply, 'read'));
  app.delete('/api/v1/staff/visits/:visitId/photo', (req, reply) => request(req, reply, 'remove'));
}

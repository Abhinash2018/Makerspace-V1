import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { faceProofSchema, scopeSchema, internalFaceCheckinSchema, faceIdentitySchema } from '../../packages/contracts/face.ts';
import { checkinResponseSchema } from '../../packages/contracts/checkin.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { verifyFaceTicket } from '../../packages/http/face-ticket.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { enrollmentIdentity, recordVisit, retainedFaceReceipt, VisitFailure } from './visits.ts';

const proofSchema = faceProofSchema.extend({ sessionScope: scopeSchema });
export function registerFaceAttendance(app: FastifyInstance, config: Configuration, now = Date.now) {
  app.post('/internal/v1/face/enrollment-identity', (req, reply) => {
    const parsed = proofSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { if (!config.faceEnabled) throw new Error(); return faceIdentitySchema.parse({ requestId: req.id, ...enrollmentIdentity(config.runtime.attendance, parsed.data, now()) }); }
    catch { return reply.code(404).send(errorBody('face_not_found', req.id)); }
  });
  app.post('/internal/v1/face/checkin', async (req, reply) => {
    const parsed = internalFaceCheckinSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    const input = parsed.data, controller = new AbortController();
    const abort = () => controller.abort(), disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const saved = retainedFaceReceipt(config.runtime.attendance, input.sessionScope, input.idempotencyKey, input.ticket, now());
      if (saved) return checkinResponseSchema.parse({ requestId: req.id, ...saved });
      if (!config.faceEnabled) throw new Error();
      verifyFaceTicket(config.serviceToken, input.ticket, input.sessionScope, input.idempotencyKey, now());
      const upstream = await boundedResponse(`${config.urls.face}/internal/v1/face/consume`, { method: 'POST', timeoutMs: 2000, maxBytes: 4096, signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-internal-service-token': config.serviceToken, 'x-request-id': req.id }, body: JSON.stringify(input),
      });
      const identity = faceIdentitySchema.parse(upstream.body);
      if (identity.requestId !== req.id || upstream.statusCode !== 200) throw new Error();
      controller.signal.throwIfAborted();
      const receipt = recordVisit(config.runtime.attendance, { name: identity.name, netId: identity.netId, sessionScope: input.sessionScope, idempotencyKey: input.idempotencyKey }, now(), input.ticket);
      return checkinResponseSchema.parse({ requestId: req.id, ...receipt });
    } catch (error) {
      const conflict = error instanceof VisitFailure && error.code === 'idempotency_conflict';
      return reply.code(conflict ? 409 : 503).send(errorBody(conflict ? 'idempotency_conflict' : 'face_unavailable', req.id));
    } finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
}

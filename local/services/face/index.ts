import { loadConfiguration } from '../../packages/config/index.mjs';
import type { Configuration } from '../../packages/contracts/index.ts';
import { liveSchema, readySchema } from '../../packages/contracts/index.ts';
import { faceIdentitySchema, faceEnrollmentSchema, faceMatchResponseSchema, faceRemovedSchema, faceListSchema, faceListQuerySchema, internalEnrollSchema, internalMatchSchema, internalWithdrawSchema, internalFaceCheckinSchema } from '../../packages/contracts/face.ts';
import { makeServer, serve } from '../../packages/http/server.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody, logEvent } from '../../packages/observability/index.ts';
import { FaceFailure, loadFaceSettings } from './settings.ts';
import { createFaceRepository } from './repository.ts';
import { createInference } from './inference.ts';
import { createTicketStore } from './tickets.ts';
import { openFace } from './database.ts';

export function createFaceService(config: Configuration, now = Date.now, inference = createInference(config.runtime.face)) {
  const app = makeServer({ service: 'face', port: config.ports.face, token: config.serviceToken, logLevel: config.logLevel });
  let repository: ReturnType<typeof createFaceRepository> | undefined;
  const repo = () => { if (!config.faceEnabled) throw new FaceFailure(); return repository ??= createFaceRepository(config.runtime.face, now); };
  const tickets = createTicketStore(config.serviceToken, now);
  let timer: ReturnType<typeof setInterval> | undefined;
  let maintenanceFailed = false;
  function sweep() { try { repo().cleanup(); maintenanceFailed = false; } catch { maintenanceFailed = true; logEvent('maintenance_failed', { service: 'face' }, config.logLevel); } }
  app.addHook('onReady', async () => { sweep(); timer = setInterval(sweep, 60 * 60_000); timer.unref(); });
  app.addHook('onClose', async () => { clearInterval(timer); tickets.clear(); });
  app.get('/health/live', req => liveSchema.parse({ requestId: req.id, service: 'face', live: true }));
  app.get('/health/ready', (req, reply) => {
    try { loadFaceSettings(config.runtime.face); const db = openFace(config.runtime.face); db.close(); if (!config.faceEnabled || maintenanceFailed) throw new FaceFailure(); return readySchema.parse({ requestId: req.id, service: 'face', ready: true, code: 'ready' }); }
    catch { return reply.code(503).send(readySchema.parse({ requestId: req.id, service: 'face', ready: false, code: 'dependency_unavailable' })); }
  });
  async function identity(proof: { visitId: string; sessionScope: string; idempotencyKey: string }, requestId: string, signal: AbortSignal) {
    const result = await boundedResponse(`${config.urls.attendance}/internal/v1/face/enrollment-identity`, { method: 'POST', timeoutMs: 2000, maxBytes: 4096, signal,
      headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-internal-service-token': config.serviceToken }, body: JSON.stringify(proof) });
    const value = faceIdentitySchema.parse(result.body);
    if (result.statusCode !== 200 || value.requestId !== requestId) throw new FaceFailure('face_not_found');
    return { name: value.name, netId: value.netId };
  }
  for (const action of ['enroll', 'match', 'withdraw', 'consume'] as const) app.post(`/internal/v1/face/${action}`, { bodyLimit: action === 'enroll' || action === 'match' ? 750000 : 8192 }, async (req, reply) => {
    const controller = new AbortController(), abort = () => controller.abort(), disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.socket?.setTimeout?.(20000); req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const store = repo();
      if (action === 'withdraw') {
        const input = internalWithdrawSchema.parse(req.body);
        if (!('code' in input) && !store.knownProof(input)) await identity(input, req.id, controller.signal);
        return faceRemovedSchema.parse({ requestId: req.id, ...store.withdraw(input) });
      }
      if (action === 'consume') {
        const input = internalFaceCheckinSchema.parse(req.body), claims = tickets.consume(input.ticket, input.sessionScope, input.idempotencyKey);
        return faceIdentitySchema.parse({ requestId: req.id, ...store.consume(claims.enrollmentId, claims.generation) });
      }
      if (action === 'enroll') {
        const input = internalEnrollSchema.parse(req.body), proof = { visitId: input.visitId, sessionScope: input.sessionScope, idempotencyKey: input.idempotencyKey };
        const original = await identity(proof, req.id, controller.signal), bytes = Buffer.from(input.image, 'base64');
        const replay = store.replay(proof, bytes);
        if (replay) return faceEnrollmentSchema.parse({ requestId: req.id, ...replay });
        const vector = await inference(bytes, controller.signal);
        const current = await identity(proof, req.id, controller.signal);
        if (JSON.stringify(original) !== JSON.stringify(current)) throw new FaceFailure('face_not_found');
        controller.signal.throwIfAborted();
        return faceEnrollmentSchema.parse({ requestId: req.id, ...store.enroll(proof, bytes, current, vector) });
      }
      const input = internalMatchSchema.parse(req.body), bytes = Buffer.from(input.image, 'base64');
      const previous = tickets.prior(input.sessionScope, input.idempotencyKey, bytes);
      if (previous) return faceMatchResponseSchema.parse({ requestId: req.id, status: 'matched', ...previous });
      const vector = await inference(bytes, controller.signal); controller.signal.throwIfAborted();
      const match = store.match(vector);
      return faceMatchResponseSchema.parse(match ? { requestId: req.id, status: 'matched', ...tickets.issue(input.sessionScope, input.idempotencyKey, bytes, match) } : { requestId: req.id, status: 'no_match' });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') return reply.code(400).send(errorBody('bad_request', req.id));
      const code = error instanceof FaceFailure ? error.code : 'face_unavailable';
      return reply.code(code === 'invalid_face' ? 400 : code === 'face_conflict' ? 409 : code === 'face_not_found' ? 404 : code === 'rate_limited' ? 429 : 503).send(errorBody(code, req.id));
    } finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
  app.get('/internal/v1/face/enrollments', (req, reply) => {
    const query = faceListQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { return faceListSchema.parse({ requestId: req.id, ...repo().list(query.data.after) }); }
    catch { return reply.code(503).send(errorBody('face_unavailable', req.id)); }
  });
  app.delete('/internal/v1/face/enrollments/:id', (req, reply) => {
    const params = faceListQuerySchema.safeParse({ after: (req.params as { id: string }).id });
    if (!params.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { return faceRemovedSchema.parse({ requestId: req.id, ...repo().withdraw({ id: params.data.after! }) }); }
    catch { return reply.code(503).send(errorBody('face_unavailable', req.id)); }
  });
  return app;
}
if (import.meta.main) {
  try { const config = loadConfiguration(); if (!config.faceEnabled) throw new FaceFailure(); await serve(createFaceService(config), 'face', config.ports.face, config.logLevel); }
  catch { console.error('Face service unavailable. Check local configuration and private storage.'); process.exitCode = 1; }
}

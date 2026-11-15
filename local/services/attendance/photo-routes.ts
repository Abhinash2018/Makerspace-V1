import type { FastifyInstance, FastifyReply } from '../../packages/http/server.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { internalPhotoRemovalSchema, internalPhotoUploadSchema, photoParamsSchema, photoRemovedSchema, photoSavedSchema, privatePhotoSchema } from '../../packages/contracts/photos.ts';
import { PhotoFailure } from './photo-codec.ts';
import type { createPhotoRepository } from './photo-repository.ts';

function failure(error: unknown, reply: FastifyReply, id: string) {
  const code = error instanceof PhotoFailure ? error.code : 'photo_unavailable';
  const status = code === 'invalid_photo' ? 400 : code === 'photo_not_found' ? 404 : code === 'photo_conflict' ? 409 : code === 'rate_limited' ? 429 : 503;
  if (status === 429) reply.header('Retry-After', 2);
  return reply.code(status).send(errorBody(code, id));
}
export function registerPhotoRoutes(app: FastifyInstance, photos: ReturnType<typeof createPhotoRepository>, onPendingCleanup: () => void) {
  app.post('/internal/v1/visit-photo', { bodyLimit: 750000 }, async (req, reply) => {
    const parsed = internalPhotoUploadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    req.raw.socket?.setTimeout?.(10000);
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try { return photoSavedSchema.parse({ requestId: req.id, ...await photos.save(parsed.data, controller.signal) }); }
    catch (error) { return failure(error, reply, req.id); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  });
  app.post('/internal/v1/visit-photo/remove', (req, reply) => {
    const parsed = internalPhotoRemovalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { const result = photos.remove(parsed.data); if (result.pendingCleanup) onPendingCleanup(); return photoRemovedSchema.parse({ requestId: req.id, ...result }); }
    catch (error) { return failure(error, reply, req.id); }
  });
  app.get('/internal/v1/visits/:visitId/photo', (req, reply) => {
    const parsed = photoParamsSchema.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { return privatePhotoSchema.parse({ requestId: req.id, ...photos.read(parsed.data.visitId) }); }
    catch (error) { return failure(error, reply, req.id); }
  });
}

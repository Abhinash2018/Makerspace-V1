import type { FastifyInstance, FastifyReply, FastifyRequest } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { errorSchema } from '../../packages/contracts/index.ts';
import { historyExportSchema, historyFilterSchema, historyQuerySchema, historyResponseSchema } from '../../packages/contracts/history.ts';
import { boundedResponse } from '../../packages/http/client.ts';
import { errorBody } from '../../packages/observability/index.ts';
import type { registerAuth } from './auth.ts';
import { createLimit } from './limits.ts';

export function registerStaffHistory(app: FastifyInstance, config: Configuration, auth: ReturnType<typeof registerAuth>) {
  const readLimit = createLimit(30, 60000), exportLimit = createLimit(3, 60000);
  async function handle(req: FastifyRequest, reply: FastifyReply, exporting: boolean) {
    if (!auth.authorize(req, reply, 'staff')) return reply;
    const attempt = (exporting ? exportLimit : readLimit)();
    if (!attempt.allowed) return reply.header('Retry-After', attempt.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    const parsed = exporting ? historyFilterSchema.safeParse(req.body) : historyQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    const query = new URLSearchParams();
    if (!exporting) for (const [key, value] of Object.entries(parsed.data)) if (value !== undefined) query.set(key, String(value));
    const controller = new AbortController(), abort = () => controller.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    req.raw.once('aborted', abort); reply.raw.once('close', disconnect);
    try {
      const response = await boundedResponse(`${config.urls.attendance}/internal/v1/visits${exporting ? '/export' : `?${query}`}`, {
        method: exporting ? 'POST' : 'GET', signal: controller.signal, timeoutMs: 2000, maxBytes: exporting ? 524288 : 65536, acceptStatuses: [400, 409, 503],
        headers: { 'content-type': 'application/json', 'x-request-id': req.id, 'x-internal-service-token': config.serviceToken },
        ...(exporting ? { body: JSON.stringify(parsed.data) } : {}),
      });
      if (response.statusCode === 200) {
        if (exporting) {
          const result = historyExportSchema.parse(response.body);
          if (result.requestId !== req.id) throw new Error('Invalid response.');
          if (!auth.authorize(req, reply, 'staff')) return reply;
          auth.touch(req);
          return reply.header('Content-Disposition', 'attachment; filename="makerspace-visits.csv"').type('text/csv; charset=utf-8').send(result.csv);
        }
        const result = historyResponseSchema.parse(response.body);
        if (result.requestId !== req.id || result.from !== (parsed.data.from ?? null) || result.to !== (parsed.data.to ?? null)
          || result.items.length > ('limit' in parsed.data ? parsed.data.limit as number : 25)) throw new Error('Invalid response.');
        const photos = 'photos' in parsed.data && parsed.data.photos === '1';
        if (result.items.some(row => photos ? typeof row.photoAvailable !== 'boolean' : row.photoAvailable !== undefined)) throw new Error('Invalid response.');
        if (!auth.authorize(req, reply, 'staff')) return reply;
        auth.touch(req); return reply.send(result);
      }
      const failure = errorSchema.parse(response.body);
      const expected = response.statusCode === 400 ? 'bad_request' : response.statusCode === 409 && exporting ? 'export_too_large' : 'history_unavailable';
      if (failure.error.requestId !== req.id || failure.error.code !== expected || (response.statusCode === 409 && !exporting)) throw new Error('Invalid response.');
      if (!auth.authorize(req, reply, 'staff')) return reply;
      return reply.code(response.statusCode).send(errorBody(expected, req.id));
    } catch { return reply.code(503).send(errorBody('history_unavailable', req.id)); }
    finally { req.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnect); }
  }
  app.get('/api/v1/staff/visits', (req, reply) => handle(req, reply, false));
  app.post('/api/v1/staff/visits/export', (req, reply) => handle(req, reply, true));
}

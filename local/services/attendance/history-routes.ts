import type { FastifyInstance } from '../../packages/http/server.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { historyExportSchema, historyFilterSchema, historyQuerySchema, historyResponseSchema } from '../../packages/contracts/history.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { exportVisits, HistoryFailure, listVisits } from './history.ts';

export function registerHistory(app: FastifyInstance, config: Configuration, now: () => number) {
  app.get('/internal/v1/visits', (req, reply) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { return historyResponseSchema.parse({ requestId: req.id, ...listVisits(config.runtime.attendance, parsed.data, config.serviceToken, now()) }); }
    catch (error) { const code = error instanceof HistoryFailure ? error.code : 'history_unavailable'; return reply.code(code === 'bad_request' ? 400 : 503).send(errorBody(code, req.id)); }
  });
  app.post('/internal/v1/visits/export', (req, reply) => {
    const parsed = historyFilterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try { return historyExportSchema.parse({ requestId: req.id, ...exportVisits(config.runtime.attendance, parsed.data, now()) }); }
    catch (error) { const code = error instanceof HistoryFailure ? error.code : 'history_unavailable'; return reply.code(code === 'bad_request' ? 400 : code === 'export_too_large' ? 409 : 503).send(errorBody(code, req.id)); }
  });
}

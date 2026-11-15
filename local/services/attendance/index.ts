import { loadConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema } from '../../packages/contracts/index.ts';
import { internalVisitRequestSchema, checkinResponseSchema } from '../../packages/contracts/checkin.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { makeServer, serve } from '../../packages/http/server.ts';
import { readiness } from './database.ts';
import { cleanupVisits, recordVisit, VisitFailure } from './visits.ts';
import { errorBody, logEvent } from '../../packages/observability/index.ts';
import { registerHistory } from './history-routes.ts';
import { createPhotoRepository } from './photo-repository.ts';

export function createAttendance(config: Configuration, now = Date.now) {
  const app = makeServer({ service: 'attendance', port: config.ports.attendance, token: config.serviceToken, logLevel: config.logLevel });
  registerHistory(app, config, now);
  let maintenanceFailed = false;
  let photoMaintenanceFailed = false;
  const photos = createPhotoRepository(config.runtime.attendance, now);
  let sweepTimer: ReturnType<typeof setInterval> | undefined;
  function sweep() {
    if (!readiness(config.runtime.attendance).ready) return;
    try { cleanupVisits(config.runtime.attendance, now()); maintenanceFailed = false; }
    catch { maintenanceFailed = true; logEvent('maintenance_failed', { service: 'attendance' }, config.logLevel); }
    try {
      const result = photos.cleanup();
      photoMaintenanceFailed = result.failed || (photoMaintenanceFailed && result.pending > 0);
      if (result.failed) logEvent('maintenance_failed', { service: 'attendance' }, config.logLevel);
    } catch { photoMaintenanceFailed = true; logEvent('maintenance_failed', { service: 'attendance' }, config.logLevel); }
  }
  app.addHook('onReady', async () => { sweep(); sweepTimer = setInterval(sweep, 60 * 60_000); sweepTimer.unref(); });
  app.addHook('onClose', async () => { clearInterval(sweepTimer); });
  app.get('/health/live', req => liveSchema.parse({ service: 'attendance', live: true, requestId: req.id }));
  app.get('/health/ready', (req, reply) => {
    const status = readiness(config.runtime.attendance);
    if (status.ready && (maintenanceFailed || photoMaintenanceFailed)) return reply.code(503).send(readySchema.parse({ service: 'attendance', requestId: req.id, ready: false, code: 'db_unavailable' }));
    return reply.code(status.ready ? 200 : 503).send(readySchema.parse({ service: 'attendance', requestId: req.id, ...status }));
  });
  app.post('/internal/v1/visits', (req, reply) => {
    const parsed = internalVisitRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    try {
      const receipt = recordVisit(config.runtime.attendance, parsed.data, now());
      maintenanceFailed = false;
      return checkinResponseSchema.parse({ requestId: req.id, ...receipt });
    } catch (error) {
      const code = error instanceof VisitFailure ? error.code : 'attendance_unavailable';
      return reply.code(code === 'bad_request' ? 400 : code === 'idempotency_conflict' ? 409 : 503).send(errorBody(code, req.id));
    }
  });
  return app;
}
if (import.meta.main) {
  try {
    // This process loads and validates its configuration before binding.
    const config = loadConfiguration();
    await serve(createAttendance(config), 'attendance', config.ports.attendance, config.logLevel);
  } catch { console.error('Attendance configuration/startup failed. Run config:check.'); process.exitCode = 1; }
}

import { loadConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema } from '../../packages/contracts/index.ts';
import type { Configuration } from '../../packages/contracts/index.ts';
import { makeServer, serve } from '../../packages/http/server.ts';
import { readiness } from './database.ts';

export function createAttendance(config: Configuration) {
  const app = makeServer({ service: 'attendance', port: config.ports.attendance, token: config.serviceToken, logLevel: config.logLevel });
  app.get('/health/live', req => liveSchema.parse({ service: 'attendance', live: true, requestId: req.id }));
  app.get('/health/ready', (req, reply) => {
    const status = readiness(config.runtime.attendance);
    return reply.code(status.ready ? 200 : 503).send(readySchema.parse({ service: 'attendance', requestId: req.id, ...status }));
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

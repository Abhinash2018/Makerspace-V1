import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Service } from '../contracts/index.ts';
import { errorBody, logEvent, requestId } from '../observability/index.ts';

export function makeServer(options: { service: Service; port: number; token?: string; origins?: string[]; logLevel?: string }) {
  const app = Fastify({
    logger: false, requestIdHeader: false,
    genReqId: req => requestId(req.headers['x-request-id']), bodyLimit: 8192,
    requestTimeout: 5000, connectionTimeout: 5000, keepAliveTimeout: 5000, forceCloseConnections: true,
  });
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${options.port}` && !(options.port === 80 && host === '127.0.0.1')) {
      return reply.code(403).send(errorBody('forbidden_host', req.id));
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !options.origins?.includes(origin)) return reply.code(403).send(errorBody('forbidden_origin', req.id));
    if (options.token && req.routeOptions.url !== '/health/live') {
      const provided = req.headers['x-internal-service-token'];
      const expected = Buffer.from(options.token);
      if (typeof provided !== 'string' || Buffer.byteLength(provided) !== expected.length || !timingSafeEqual(Buffer.from(provided), expected)) {
        return reply.code(401).send(errorBody('unauthorized', req.id));
      }
    }
    if (!options.token) {
      // Only server-constructed headers can carry trusted context upstream.
      delete req.headers['x-internal-service-token'];
      delete req.headers['x-user-id'];
    }
  });
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Request-ID', req.id).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'no-store');
    return payload;
  });
  app.addHook('onResponse', async (req, reply) => {
    logEvent('request_completed', { service: options.service, requestId: req.id, statusCode: reply.statusCode }, options.logLevel ?? 'info');
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send(errorBody('not_found', req.id)));
  app.setErrorHandler((error: { statusCode?: number }, req, reply) => {
    const status = error.statusCode === 413 ? 413 : error.statusCode && error.statusCode < 500 ? 400 : 500;
    reply.code(status).send(errorBody(status === 413 ? 'request_too_large' : status === 400 ? 'bad_request' : 'internal_error', req.id));
  });
  return app;
}

export async function serve(app: FastifyInstance, service: Service, port: number, level: string) {
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    logEvent('service_stopped', { service }, level);
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  // The launcher sends IPC shutdown on Windows, where signals are limited.
  process.on('message', message => { if (message === 'shutdown') void stop().finally(() => process.disconnect?.()); });
  try {
    await app.listen({ host: '127.0.0.1', port });
    logEvent('service_started', { service }, level);
  } catch {
    logEvent('startup_failed', { service }, level);
    await app.close();
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}

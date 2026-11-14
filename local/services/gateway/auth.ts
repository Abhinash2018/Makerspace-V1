import type { FastifyInstance, FastifyRequest, FastifyReply } from '../../packages/http/server.ts';
import { sessionRequestSchema, sessionResponseSchema, staffLoginSchema, signedOutSchema } from '../../packages/contracts/index.ts';
import { errorBody } from '../../packages/observability/index.ts';
import { createSessionStore, SessionCapacityError } from './sessions.ts';
import type { SessionRole, SessionSnapshot } from './sessions.ts';
import { createStaffVerifier, loadStaffCredential } from './credentials.ts';
import { createLimit } from './limits.ts';

export type AuthOptions = { directory: string; origins: string[]; now?: () => number };
const cookieName = 'makerspace_session';
function cookieToken(cookie: string | undefined): string | undefined {
  if (cookie === undefined) return undefined;
  if (cookie.length > 4096) throw new Error('Invalid cookie.');
  const values = cookie.split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
  if (values.length > 1) throw new Error('Duplicate cookie.');
  return values[0]?.slice(cookieName.length + 1);
}
export function registerAuth(app: FastifyInstance, options: AuthOptions) {
  const sessions = createSessionStore(options.now);
  const verify = createStaffVerifier(loadStaffCredential(options.directory));
  const apiLimit = createLimit(240, 60_000, options.now);
  const sessionLimit = createLimit(20, 60_000, options.now);
  const loginLimit = createLimit(5, 60_000, options.now);
  const token = (req: FastifyRequest) => cookieToken(req.headers.cookie);
  const sendSession = (req: FastifyRequest, reply: FastifyReply, issued: { token: string; session: SessionSnapshot }) => {
    reply.header('Set-Cookie', `${cookieName}=${issued.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(issued.session.absoluteExpiresInMs / 1000)}`);
    return reply.send(sessionResponseSchema.parse({ requestId: req.id, ...issued.session }));
  };
  function withinLimit(req: FastifyRequest, reply: FastifyReply, limit: ReturnType<typeof createLimit>) {
    const attempt = limit();
    if (attempt.allowed) return true;
    reply.header('Retry-After', attempt.retryAfterSeconds).code(429).send(errorBody('rate_limited', req.id));
    return false;
  }
  function authorize(req: FastifyRequest, reply: FastifyReply, role?: SessionRole): SessionSnapshot | undefined {
    const session = sessions.get(token(req));
    if (!session) { reply.code(401).send(errorBody('unauthorized', req.id)); return undefined; }
    if (role && session.role !== role) { reply.code(403).send(errorBody('forbidden_role', req.id)); return undefined; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sessions.verifyCsrf(token(req), req.headers['x-csrf-token'])) {
      reply.code(403).send(errorBody('forbidden_csrf', req.id)); return undefined;
    }
    return session;
  }
  app.addHook('onRequest', async (req, reply) => {
    // No caller can assert trusted context, even on routes added by later tasks.
    for (const name of Object.keys(req.headers)) {
      if (name.startsWith('x-internal-') || name.startsWith('x-user-') || name.startsWith('x-staff-') || name.startsWith('x-session-') || name === 'x-role') delete req.headers[name];
    }
    if (!(req.routeOptions.url ?? req.url.split('?')[0] ?? '').startsWith('/api/')) return;
    if (!withinLimit(req, reply, apiLimit)) return reply;
    const metadata = req.headers['sec-fetch-site'];
    if (metadata !== undefined && metadata !== 'same-origin' && metadata !== 'none') return reply.code(403).send(errorBody('forbidden_origin', req.id));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (typeof req.headers.origin !== 'string' || !options.origins.includes(req.headers.origin))) {
      return reply.code(403).send(errorBody('forbidden_origin', req.id));
    }
    try { token(req); } catch { return reply.code(400).send(errorBody('bad_request', req.id)); }
  });
  app.addHook('onClose', async () => { sessions.clear(); });
  app.post('/api/v1/session', async (req, reply) => {
    if (!sessionRequestSchema.safeParse(req.body).success) return reply.code(400).send(errorBody('bad_request', req.id));
    const previous = token(req), current = sessions.get(previous);
    if (current) {
      if (!authorize(req, reply)) return reply;
    } else if (req.headers['x-kiosk-bootstrap'] !== '1') return reply.code(403).send(errorBody('forbidden_csrf', req.id));
    if (!withinLimit(req, reply, sessionLimit)) return reply;
    try { return sendSession(req, reply, (current ? sessions.rotate(previous, 'kiosk') : sessions.create('kiosk'))!); }
    catch (error) {
      if (!(error instanceof SessionCapacityError)) throw error;
      return reply.header('Retry-After', 120).code(503).send(errorBody('session_capacity', req.id));
    }
  });
  app.get('/api/v1/session', async (req, reply) => {
    const session = authorize(req, reply);
    return session ? sessionResponseSchema.parse({ requestId: req.id, ...session }) : reply;
  });
  app.post('/api/v1/staff/login', async (req, reply) => {
    if (!authorize(req, reply, 'kiosk')) return reply;
    if (!withinLimit(req, reply, loginLimit)) return reply;
    const parsed = staffLoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', req.id));
    const result = await verify(parsed.data.password);
    if (result === 'invalid') return reply.code(401).send(errorBody('unauthorized', req.id));
    if (result === 'busy') return reply.header('Retry-After', 1).code(429).send(errorBody('rate_limited', req.id));
    if (result !== 'ok') return reply.code(503).send(errorBody('auth_unavailable', req.id));
    // Verification is async: recheck the old session/CSRF before committing a
    // role change. Logout/reset/expiry during hashing must not resurrect it.
    if (!authorize(req, reply, 'kiosk')) return reply;
    try {
      const issued = sessions.rotate(token(req), 'staff');
      if (!issued) return reply.code(401).send(errorBody('unauthorized', req.id));
      return sendSession(req, reply, issued);
    } catch (error) {
      if (!(error instanceof SessionCapacityError)) throw error;
      return reply.header('Retry-After', 900).code(503).send(errorBody('session_capacity', req.id));
    }
  });
  app.post('/api/v1/staff/logout', async (req, reply) => {
    if (!authorize(req, reply, 'staff')) return reply;
    if (!sessionRequestSchema.safeParse(req.body).success) return reply.code(400).send(errorBody('bad_request', req.id));
    sessions.revoke(token(req));
    reply.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return signedOutSchema.parse({ requestId: req.id, signedOut: true });
  });
  return { authorize, sessions };
}

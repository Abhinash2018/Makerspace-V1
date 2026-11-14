import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export type SessionRole = 'kiosk' | 'staff';
export type SessionSnapshot = Readonly<{
  role: SessionRole;
  csrfToken: string;
  idleExpiresInMs: number;
  absoluteExpiresInMs: number;
}>;
export type IssuedSession = Readonly<{ token: string; session: SessionSnapshot }>;

const policies = {
  kiosk: { idleMs: 2 * 60_000, absoluteMs: 30 * 60_000, capacity: 128 },
  staff: { idleMs: 15 * 60_000, absoluteMs: 8 * 60 * 60_000, capacity: 16 },
} as const;
type StoredSession = { role: SessionRole; csrfToken: string; createdAt: number; lastActiveAt: number };

export class SessionCapacityError extends Error {
  constructor() { super('Session capacity reached.'); this.name = 'SessionCapacityError'; }
}

function tokenKey(token: unknown): string | undefined {
  if (typeof token !== 'string' || token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHash('sha256').update(token).digest('hex');
}

// Gateway-owned process memory. Restart/clear revokes every session; no timers,
// files, cookies, credentials, service calls or identity data belong here.
export function createSessionStore(now: () => number = () => performance.now()) {
  const sessions = new Map<string, StoredSession>();

  function expired(session: StoredSession, at: number) {
    const policy = policies[session.role];
    return at - session.lastActiveAt >= policy.idleMs || at - session.createdAt >= policy.absoluteMs;
  }
  function find(token: unknown, at: number) {
    const key = tokenKey(token);
    if (key === undefined) return undefined;
    const session = sessions.get(key);
    if (!session) return undefined;
    if (expired(session, at)) { sessions.delete(key); return undefined; }
    return { key, session };
  }
  function snapshot(session: StoredSession, at: number): SessionSnapshot {
    const policy = policies[session.role];
    const absoluteExpiresInMs = policy.absoluteMs - (at - session.createdAt);
    return Object.freeze({
      role: session.role, csrfToken: session.csrfToken, absoluteExpiresInMs,
      idleExpiresInMs: Math.min(policy.idleMs - (at - session.lastActiveAt), absoluteExpiresInMs),
    });
  }
  function issue(role: SessionRole, at: number, previousKey?: string): IssuedSession {
    if (!Object.hasOwn(policies, role)) throw new RangeError('Invalid session role.');
    let active = 0;
    for (const [key, session] of sessions) {
      if (expired(session, at)) sessions.delete(key);
      else if (session.role === role && key !== previousKey) active++;
    }
    if (active >= policies[role].capacity) throw new SessionCapacityError();

    let token: string;
    let key: string;
    do {
      token = randomBytes(32).toString('base64url');
      key = tokenKey(token)!;
    } while (sessions.has(key));
    const session: StoredSession = { role, csrfToken: randomBytes(32).toString('base64url'), createdAt: at, lastActiveAt: at };
    // Generate the complete replacement before revoking the original. A full
    // target role or random-source failure must preserve the active session.
    sessions.set(key, session);
    if (previousKey !== undefined) sessions.delete(previousKey);
    return Object.freeze({ token, session: snapshot(session, at) });
  }

  return {
    create(role: SessionRole) { return issue(role, now()); },
    get(token: unknown): SessionSnapshot | undefined {
      const at = now(), match = find(token, at);
      return match ? snapshot(match.session, at) : undefined;
    },
    verifyCsrf(token: unknown, supplied: unknown): boolean {
      const match = find(token, now());
      if (!match || typeof supplied !== 'string' || supplied.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
      return timingSafeEqual(Buffer.from(match.session.csrfToken), Buffer.from(supplied));
    },
    // Call only after an authorized action, never for polling or rejected input.
    touch(token: unknown): boolean {
      const at = now(), match = find(token, at);
      if (!match) return false;
      match.session.lastActiveAt = at;
      return true;
    },
    // The HTTP layer must verify credentials before rotating into staff role.
    rotate(token: unknown, role: SessionRole): IssuedSession | undefined {
      const at = now(), match = find(token, at);
      return match ? issue(role, at, match.key) : undefined;
    },
    revoke(token: unknown): void {
      const key = tokenKey(token);
      if (key !== undefined) sessions.delete(key);
    },
    clear(): void { sessions.clear(); },
  };
}

import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requestId(value: unknown): string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value) ? value : randomUUID();
}

const events = ['request_completed', 'service_started', 'service_stopped', 'startup_failed', 'port_in_use'] as const;
type Event = typeof events[number];
// An allowlist avoids accidentally recording new nested fields or error bodies.
// Request URLs, bodies, prompts, headers, identities and arbitrary messages are
// never serialized, even when LOG_LEVEL is debug or trace.
export function logEvent(event: Event, context: Record<string, unknown>, level = 'info', sink: (line: string) => void = line => { process.stdout.write(line); }) {
  if (level === 'silent' || !events.includes(event)) return;
  const safe: Record<string, unknown> = { time: new Date().toISOString(), level: event === 'startup_failed' ? 'error' : 'info', event };
  if (['gateway', 'attendance', 'knowledge', 'launcher'].includes(String(context.service))) safe.service = context.service;
  if (typeof context.requestId === 'string' && uuid.test(context.requestId)) safe.requestId = context.requestId;
  if (typeof context.statusCode === 'number' && Number.isInteger(context.statusCode) && context.statusCode >= 100 && context.statusCode <= 599) safe.statusCode = context.statusCode;
  if (level === 'fatal' || (level === 'error' && event !== 'startup_failed') || (level === 'warn' && event !== 'startup_failed')) return;
  sink(`${JSON.stringify(safe)}\n`);
}

export const errorMessages = {
  not_found: 'Route not found.', unauthorized: 'Unauthorized.', forbidden_host: 'Host is not allowed.',
  forbidden_origin: 'Origin is not allowed.', bad_request: 'Request is invalid.', internal_error: 'Request failed.',
  request_too_large: 'Request is too large.',
  forbidden_csrf: 'Request verification failed.', forbidden_role: 'This session cannot perform that action.',
  rate_limited: 'Too many requests. Try again later.', auth_unavailable: 'Staff sign-in is temporarily unavailable.',
  session_capacity: 'Session capacity reached. Try again later.',
  idempotency_conflict: 'This attempt was already used with different details.',
  attendance_unavailable: 'Check-in could not be confirmed. Try the same attempt again.',
} as const;
export function errorBody(code: keyof typeof errorMessages, id: string) {
  return { error: { code, message: errorMessages[code], requestId: id } };
}

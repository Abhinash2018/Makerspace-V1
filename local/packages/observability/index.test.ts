import { describe, expect, it } from 'vitest';
import { errorSchema, requestIdSchema } from '../contracts/index.ts';
import { errorBody, logEvent, requestId } from './index.ts';

describe('request IDs and allowlisted logs', () => {
  it('keeps valid IDs and replaces malformed, array or unbounded headers', () => {
    const id = requestId(undefined);
    expect(requestId(id)).toBe(id);
    for (const value of ['name', 'x'.repeat(10000), [id], 'bad\r\nheader']) expect(requestIdSchema.safeParse(requestId(value)).success).toBe(true);
    expect(requestId(undefined)).not.toBe(requestId(undefined));
  });
  it('never serializes arbitrary content, secrets or identities at any verbosity', () => {
    const lines: string[] = [];
    logEvent('request_completed', {
      service: 'gateway', requestId: requestId(undefined), statusCode: 200,
      token: 'synthetic-secret', body: { prompt: 'synthetic-question', identity: 'synthetic-person' },
      headers: { authorization: 'secret' }, message: 'private', error: new Error('secret'), url: '/?name=private',
    }, 'trace', line => { lines.push(line); });
    expect(Object.keys(JSON.parse(lines[0]!)).sort()).toEqual(['event', 'level', 'requestId', 'service', 'statusCode', 'time']);
    expect(lines.join('')).not.toMatch(/synthetic|private|secret/);
    logEvent('startup_failed', { service: 'knowledge', error: 'private' }, 'silent', line => { lines.push(line); });
    expect(lines).toHaveLength(1);
  });
  it('emits schema-valid fixed errors without reflected messages or stacks', () => {
    expect(errorSchema.parse(errorBody('not_found', requestId(undefined))).error.message).toBe('Route not found.');
  });
});

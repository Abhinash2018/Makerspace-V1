import { describe, expect, it } from 'vitest';
import { errorSchema, liveSchema, modelStatusSchema, readySchema, requestIdSchema, systemStatusSchema } from './index.ts';

const requestId = '0464accc-6eed-44ce-a064-d38f29dcba93';
describe('v1 HTTP contracts', () => {
  it('validates bounded request IDs and consistent errors without extra data', () => {
    expect(requestIdSchema.safeParse(requestId).success).toBe(true);
    for (const invalid of ['', 'x'.repeat(10000), ['a'], 'visitor-name']) expect(requestIdSchema.safeParse(invalid).success).toBe(false);
    const body = { error: { code: 'unauthorized', message: 'Unauthorized.', requestId } };
    expect(errorSchema.parse(body)).toEqual(body);
    expect(errorSchema.safeParse({ ...body, token: 'secret' }).success).toBe(false);
    expect(errorSchema.safeParse({ error: { ...body.error, stack: 'private' } }).success).toBe(false);
  });
  it('keeps liveness, database readiness and model capability separate', () => {
    expect(liveSchema.parse({ requestId, service: 'attendance', live: true }).live).toBe(true);
    expect(readySchema.parse({ requestId, service: 'knowledge', ready: true, code: 'ready' }).ready).toBe(true);
    expect(modelStatusSchema.parse({ requestId, runtimeAvailable: null, modelAvailable: false, code: 'model_not_configured' }).code).toBe('model_not_configured');
  });
  it('validates versioned aggregate status and rejects identity/path payloads', () => {
    const component = { ready: true, code: 'ready' };
    const status = { apiVersion: 1, requestId, state: 'degraded', components: { gateway: component, attendance: component, knowledge: component, ollama: { ready: false, code: 'model_missing' } } };
    expect(systemStatusSchema.parse(status).state).toBe('degraded');
    expect(systemStatusSchema.safeParse({ ...status, apiVersion: 2 }).success).toBe(false);
    expect(systemStatusSchema.safeParse({ ...status, student: 'synthetic' }).success).toBe(false);
    expect(systemStatusSchema.safeParse({ ...status, components: { ...status.components, gateway: { ...component, path: 'private' } } }).success).toBe(false);
  });
});

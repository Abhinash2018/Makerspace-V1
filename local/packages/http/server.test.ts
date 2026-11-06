import { expect, it } from 'vitest';
import { errorSchema, requestIdSchema } from '../contracts/index.ts';
import { makeServer } from './server.ts';

it('protects Host, Origin and every internal route except liveness; never reflects errors', async () => {
  const app = makeServer({ service: 'attendance', port: 3001, token: 'a'.repeat(64), logLevel: 'silent' });
  app.get('/health/live', () => ({ live: true }));
  app.get('/private', () => { throw new Error('synthetic-secret'); });
  try {
    const host = { host: '127.0.0.1:3001' };
    expect((await app.inject({ url: '/health/live', headers: host })).statusCode).toBe(200);
    expect((await app.inject({ url: '/private', headers: host })).statusCode).toBe(401);
    expect((await app.inject({ url: '/private', headers: { ...host, 'x-internal-service-token': 'a'.repeat(64) } })).statusCode).toBe(500);
    for (const headers of [{ host: 'evil.invalid:3001' }, { ...host, origin: 'http://evil.invalid' }]) {
      const res = await app.inject({ url: '/health/live', headers });
      expect(res.statusCode).toBe(403); expect(errorSchema.safeParse(res.json()).success).toBe(true);
    }
    const res = await app.inject({ url: '/private', headers: { ...host, 'x-internal-service-token': 'a'.repeat(64), 'x-request-id': 'synthetic-name' } });
    expect(requestIdSchema.safeParse(res.headers['x-request-id']).success).toBe(true);
    expect(res.json().error.requestId).toBe(res.headers['x-request-id']);
    expect(res.body).not.toMatch(/synthetic|stack/);
  } finally { await app.close(); }
}, 15000);

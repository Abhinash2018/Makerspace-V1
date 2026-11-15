import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { modelStatusSchema } from '../../packages/contracts/index.ts';
import { migrate } from './database.ts';
import { createKnowledge } from './index.ts';

it('keeps DB readiness independent of AI and protects diagnostics', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-knowledge-api-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  const app = createKnowledge(config);
  const headers = { host: '127.0.0.1:3002', 'x-internal-service-token': config.serviceToken };
  try {
    expect((await app.inject({ url: '/health/live', headers: { host: headers.host } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/internal/v1/model-status', headers: { host: headers.host } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(503);
    migrate(config.runtime.knowledge);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(200);
    const response = await app.inject({ url: '/internal/v1/model-status', headers });
    expect(modelStatusSchema.parse(response.json()).code).toBe('model_not_configured');
    expect(response.headers['x-request-id']).toBe(response.json().requestId);
    expect((await app.inject({ method: 'POST', url: '/api/chat', headers })).statusCode).toBe(404);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
}, 15000);

it('validates knowledge-owned embedding settings at startup without calling a model', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-settings-startup-'));
  try {
    const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
    mkdirSync(config.runtime.knowledge, { recursive: true });
    writeFileSync(path.join(config.runtime.knowledge, 'embedding-settings.json'), '{broken-private-setting');
    expect(() => createKnowledge(config)).toThrow('Embedding settings unavailable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

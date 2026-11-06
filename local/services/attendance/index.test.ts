import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema } from '../../packages/contracts/index.ts';
import { migrate } from './database.ts';
import { createAttendance } from './index.ts';

it('serves independent authenticated readiness and exposes no student endpoints', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-attendance-api-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  const app = createAttendance(config);
  const headers = { host: '127.0.0.1:3001', 'x-internal-service-token': config.serviceToken };
  try {
    const live = await app.inject({ url: '/health/live', headers: { host: headers.host } });
    expect(liveSchema.parse(live.json()).live).toBe(true);
    expect((await app.inject({ url: '/health/ready', headers: { host: headers.host } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(503);
    migrate(config.runtime.attendance);
    const ready = await app.inject({ url: '/health/ready', headers });
    expect(ready.statusCode).toBe(200); expect(readySchema.parse(ready.json()).ready).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/v1/checkin', headers })).statusCode).toBe(404);
    expect(ready.headers['x-request-id']).toBe(ready.json().requestId);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
}, 15000);

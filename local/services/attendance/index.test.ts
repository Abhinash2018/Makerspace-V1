import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { parseConfiguration } from '../../packages/config/index.mjs';
import { liveSchema, readySchema } from '../../packages/contracts/index.ts';
import { migrate } from './database.ts';
import { createAttendance } from './index.ts';
import { recordVisit, retentionMs } from './visits.ts';

it('serves independent authenticated readiness and keeps public attendance routes absent', async () => {
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
    expect((await app.inject({ url: '/internal/v1/visits', headers: { host: headers.host } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/internal/v1/visits', headers })).json().items).toEqual([]);
    expect((await app.inject({ url: '/internal/v1/visits?from=2026-02-29&to=2026-03-01', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits/export', headers, payload: { name: 'forged' } })).statusCode).toBe(400);
    expect(ready.headers['x-request-id']).toBe(ready.json().requestId);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
}, 15000);

it('authenticates internal writes, returns committed/replayed receipts and never reflects identity', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms002-attendance-api-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  const app = createAttendance(config);
  const headers = { host: '127.0.0.1:3001', 'x-internal-service-token': config.serviceToken };
  const body = { name: 'Synthetic API Visitor', netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'b'.repeat(64) };
  try {
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits', headers: { host: headers.host }, payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: body })).statusCode).toBe(503);
    migrate(config.runtime.attendance);
    const first = await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: body });
    expect(first.statusCode).toBe(200); expect(first.json().selfReported).toBe(true);
    expect(first.body).not.toContain(body.name); expect(first.body).not.toContain(body.netId);
    const replay = await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: body });
    expect(replay.json().visitId).toBe(first.json().visitId); expect(replay.json().replayed).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: { ...body, name: 'Different synthetic visitor' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: { ...body, role: 'staff' } })).statusCode).toBe(400);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});

it('sweeps expired visits at startup and hourly, and closes its maintenance timer', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms002-retention-api-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  let at = Date.parse('2026-11-13T20:00:00Z');
  migrate(config.runtime.attendance);
  const request = () => ({ name: 'Synthetic Expiring Visitor', netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'b'.repeat(64) });
  recordVisit(config.runtime.attendance, request(), at - retentionMs);
  recordVisit(config.runtime.attendance, request(), at - retentionMs + 1);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const app = createAttendance(config, () => at);
  try {
    await app.ready();
    const count = () => { const db = new Database(path.join(config.runtime.attendance, 'attendance.sqlite')); try { return db.prepare('SELECT count(*) AS n FROM visits').get(); } finally { db.close(); } };
    expect(count()).toEqual({ n: 1 });
    at += 60 * 60_000; vi.advanceTimersByTime(60 * 60_000);
    expect(count()).toEqual({ n: 0 });
    await app.close(); expect(vi.getTimerCount()).toBe(0);
  } finally { await app.close(); vi.useRealTimers(); rmSync(root, { recursive: true, force: true }); }
});

it('reports a failed retention sweep as unready and recovers after a successful write', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms002-retention-failure-'));
  const config = parseConfiguration({ INTERNAL_SERVICE_TOKEN: 'a'.repeat(64), LOG_LEVEL: 'silent' }, root);
  migrate(config.runtime.attendance);
  const lock = new Database(path.join(config.runtime.attendance, 'attendance.sqlite'));
  lock.exec('BEGIN IMMEDIATE');
  const app = createAttendance(config);
  const headers = { host: '127.0.0.1:3001', 'x-internal-service-token': config.serviceToken };
  try {
    await app.ready();
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(503);
    lock.exec('ROLLBACK');
    const write = await app.inject({ method: 'POST', url: '/internal/v1/visits', headers, payload: { name: 'Synthetic Recovery Visitor', netId: 'ab123', idempotencyKey: randomUUID(), sessionScope: 'b'.repeat(64) } });
    expect(write.statusCode).toBe(200);
    expect((await app.inject({ url: '/health/ready', headers })).statusCode).toBe(200);
  } finally { if (lock.inTransaction) lock.exec('ROLLBACK'); lock.close(); await app.close(); rmSync(root, { recursive: true, force: true }); }
});

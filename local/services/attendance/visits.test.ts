import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate } from './database.ts';
import { recordVisit, cleanupVisits, retentionMs, VisitFailure } from './visits.ts';

const input = () => ({ name: '  Synthetic   O’Neil  ', netId: ' AB123 ', idempotencyKey: randomUUID(), sessionScope: 'a'.repeat(64) });
function fixture() { const root = mkdtempSync(path.join(tmpdir(), 'ms002-visits-')); migrate(root); return root; }
it('commits normalized self-reports once, replays an attempt and rejects a changed payload', () => {
  const root = fixture();
  const request = input(), at = Date.parse('2026-11-13T20:00:00Z');
  try {
    const first = recordVisit(root, request, at);
    expect(first).toMatchObject({ recordedAt: '2026-11-13T20:00:00.000Z', selfReported: true, replayed: false });
    expect(recordVisit(root, { ...request, name: 'Synthetic O’Neil', netId: 'ab123' }, at + 1000)).toEqual({ ...first, replayed: true });
    expect(() => recordVisit(root, { ...request, name: 'Changed synthetic name' }, at + 1000)).toThrow('idempotency_conflict');
    const other = recordVisit(root, { ...request, sessionScope: 'b'.repeat(64) }, at + 1000);
    expect(other.visitId).not.toBe(first.visitId);
    const db = new Database(path.join(root, 'attendance.sqlite'));
    const rows = db.prepare('SELECT name, net_id, self_reported, attempt_digest, payload_digest FROM visits').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Synthetic O’Neil', net_id: 'ab123', self_reported: 1 });
    expect(JSON.stringify(rows)).not.toContain(request.idempotencyKey);
    expect(JSON.stringify(rows)).not.toContain(request.sessionScope);
    expect(() => db.prepare('UPDATE visits SET self_reported=0').run()).toThrow();
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('enforces an inclusive 30-day cutoff and runs retention before recording another visit', () => {
  const root = fixture();
  const at = Date.parse('2026-10-14T20:00:00Z');
  try {
    recordVisit(root, input(), at);
    recordVisit(root, input(), at + 1);
    expect(cleanupVisits(root, at + retentionMs)).toBe(1);
    expect(cleanupVisits(root, at + retentionMs)).toBe(0);
    recordVisit(root, input(), at + retentionMs + 1);
    const db = new Database(path.join(root, 'attendance.sqlite'));
    expect(db.prepare('SELECT recorded_at_ms FROM visits').all()).toEqual([{ recorded_at_ms: at + retentionMs + 1 }]);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('fails without creating missing DBs, rejects invalid inputs and rolls back on a held write lock', () => {
  const root = fixture();
  try {
    expect(() => recordVisit(path.join(root, 'missing'), input())).toThrow('attendance_unavailable');
    expect(existsSync(path.join(root, 'missing', 'attendance.sqlite'))).toBe(false);
    expect(() => recordVisit(root, { ...input(), name: '\0' })).toThrow('bad_request');
    const db = new Database(path.join(root, 'attendance.sqlite'));
    db.exec('BEGIN IMMEDIATE');
    try { expect(() => recordVisit(root, input())).toThrow(VisitFailure); }
    finally { db.exec('ROLLBACK'); }
    expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 0 }); db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('serializes concurrent duplicate attempts across independent SQLite connections', async () => {
  const root = fixture(), request = input();
  const module = new URL('./visits.ts', import.meta.url).href;
  const source = "const {parentPort,workerData}=require('node:worker_threads'); import(workerData.module).then(({recordVisit})=>parentPort.postMessage(recordVisit(workerData.root,workerData.request))).catch(error=>parentPort.postMessage({workerError:error.code??error.message}));";
  const workers: Worker[] = [];
  try {
    const receipts = await Promise.all(Array.from({ length: 4 }, () => new Promise<{ visitId: string; replayed: boolean }>((resolve, reject) => {
      const worker = new Worker(source, { eval: true, workerData: { root, request, module } }); workers.push(worker);
      worker.once('message', value => { if (value.workerError) reject(new Error(`Synthetic worker: ${value.workerError}`)); else resolve(value); }); worker.once('error', reject); worker.once('exit', code => { if (code) reject(new Error('Synthetic concurrent write failed.')); });
    })));
    expect(new Set(receipts.map(receipt => receipt.visitId)).size).toBe(1);
    expect(receipts.filter(receipt => !receipt.replayed)).toHaveLength(1);
    const db = new Database(path.join(root, 'attendance.sqlite')); expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 1 }); db.close();
  } finally { await Promise.all(workers.map(worker => worker.terminate())); rmSync(root, { recursive: true, force: true }); }
});

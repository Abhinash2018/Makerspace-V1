import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { internalVisitRequestSchema } from '../../packages/contracts/checkin.ts';
import type { InternalVisitRequest, CheckinResponse } from '../../packages/contracts/checkin.ts';
import { openAttendance } from './database.ts';

export const retentionMs = 30 * 24 * 60 * 60_000;
export class VisitFailure extends Error {
  readonly code: 'bad_request' | 'idempotency_conflict' | 'attendance_unavailable';
  constructor(code: VisitFailure['code']) { super(code); this.code = code; }
}
type Receipt = Omit<CheckinResponse, 'requestId'>;
type Row = { id: string; recorded_at_ms: number; payload_digest: string };
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function timestamp(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) throw new VisitFailure('attendance_unavailable');
  return value;
}
function withDatabase<T>(directory: string, action: (db: Database.Database) => T): T {
  try {
    const db = openAttendance(directory);
    try { return action(db); } finally { db.close(); }
  } catch (error) {
    if (error instanceof VisitFailure) throw error;
    throw new VisitFailure('attendance_unavailable');
  }
}
export function cleanupVisits(directory: string, at = Date.now()): number {
  const cutoff = timestamp(at) - retentionMs;
  return withDatabase(directory, db => db.transaction(() => db.prepare('DELETE FROM visits WHERE recorded_at_ms <= ?').run(cutoff).changes).immediate());
}
export function recordVisit(directory: string, request: InternalVisitRequest, at = Date.now()): Receipt {
  const parsed = internalVisitRequestSchema.safeParse(request);
  if (!parsed.success) throw new VisitFailure('bad_request');
  timestamp(at);
  const input = parsed.data;
  const attempt = digest([input.sessionScope, input.idempotencyKey]);
  const payload = digest([input.name, input.netId]);
  return withDatabase(directory, db => db.transaction((): Receipt => {
    db.prepare('DELETE FROM visits WHERE recorded_at_ms <= ?').run(at - retentionMs);
    const existing = db.prepare('SELECT id, recorded_at_ms, payload_digest FROM visits WHERE attempt_digest = ?').get(attempt) as Row | undefined;
    if (existing) {
      if (existing.payload_digest !== payload) throw new VisitFailure('idempotency_conflict');
      return { visitId: existing.id, recordedAt: new Date(existing.recorded_at_ms).toISOString(), selfReported: true, replayed: true };
    }
    const id = randomUUID();
    db.prepare('INSERT INTO visits (id, name, net_id, recorded_at_ms, self_reported, attempt_digest, payload_digest) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(id, input.name, input.netId, at, attempt, payload);
    return { visitId: id, recordedAt: new Date(at).toISOString(), selfReported: true, replayed: false };
  }).immediate());
}

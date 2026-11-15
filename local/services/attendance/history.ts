import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { historyFilterSchema, historyQuerySchema, historyRecordSchema, type HistoryFilter, type HistoryQuery, type HistoryRecord, type HistoryResponse } from '../../packages/contracts/history.ts';
import { openAttendance } from './database.ts';
import { retentionMs } from './visits.ts';

export class HistoryFailure extends Error {
  readonly code: 'bad_request' | 'history_unavailable' | 'export_too_large';
  constructor(code: HistoryFailure['code']) { super(code); this.code = code; }
}
const dayMs = 86400000, cursorLife = 600000;
const central = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' });
const parts = (at: number) => Object.fromEntries(central.formatToParts(new Date(at)).map(part => [part.type, part.value]));
export function chicagoMidnight(date: string): number {
  const desired = Date.parse(`${date}T00:00:00Z`);
  // The upper exclusive day may be just outside the public filter-year bounds.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(desired) || new Date(desired).toISOString().slice(0, 10) !== date) throw new HistoryFailure('bad_request');
  let candidate = desired + 6 * 3600000;
  for (let pass = 0; pass < 3; pass++) {
    const wall = parts(candidate);
    const observed = Date.parse(`${wall.year}-${wall.month}-${wall.day}T${wall.hour}:${wall.minute}:${wall.second}Z`);
    candidate += desired - observed;
  }
  return candidate;
}
export function chicagoTimestamp(at: number): string {
  const wall = parts(at);
  return `${wall.year}-${wall.month}-${wall.day}T${wall.hour}:${wall.minute}:${wall.second}${wall.timeZoneName!.replace('GMT', '')}`;
}
type Cursor = { v: 1; issued: number; snapshot: number; highWater: number; lastTime: number; lastId: string; filter: string };
function key(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new HistoryFailure('history_unavailable');
  return createHash('sha256').update('attendance-history-v1\0').update(secret).digest();
}
const filterHash = (query: HistoryQuery) => createHash('sha256').update(JSON.stringify([query.from ?? null, query.to ?? null, query.limit, query.photos ?? null])).digest('hex');
function encode(cursor: Cursor, secret: string) {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${payload}.${createHmac('sha256', key(secret)).update(payload).digest('base64url')}`;
}
function decode(value: string, query: HistoryQuery, secret: string, at: number): Cursor {
  try {
    const [payload, signature] = value.split('.');
    if (!payload || !signature || Buffer.from(payload, 'base64url').toString('base64url') !== payload) throw new Error();
    const received = Buffer.from(signature, 'base64url'), expected = createHmac('sha256', key(secret)).update(payload).digest();
    if (received.toString('base64url') !== signature || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const row = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Cursor;
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'filter,highWater,issued,lastId,lastTime,snapshot,v'
      || row.v !== 1 || ![row.issued, row.snapshot, row.highWater, row.lastTime].every(number => Number.isSafeInteger(number) && number >= 0)
      || row.snapshot !== row.issued || row.lastTime > row.snapshot || row.issued > at || at - row.issued >= cursorLife
      || row.filter !== filterHash(query) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.lastId)) throw new Error();
    return row;
  } catch { throw new HistoryFailure('bad_request'); }
}
function bounds(filter: HistoryFilter, at: number, snapshot: number, highWater: number) {
  const from = filter.from ? chicagoMidnight(filter.from) : 0;
  const nextDate = filter.to ? new Date(Date.parse(`${filter.to}T00:00:00Z`) + dayMs).toISOString().slice(0, 10) : null;
  const to = nextDate ? chicagoMidnight(nextDate) : 8_640_000_000_000_000;
  return { sql: 'recorded_at_ms > ? AND recorded_at_ms >= ? AND recorded_at_ms < ? AND recorded_at_ms <= ? AND rowid <= ?', values: [at - retentionMs, from, to, snapshot, highWater] };
}
type Row = { id: string; name: string; net_id: string; recorded_at_ms: number; photo_available?: number };
function record(row: Row): HistoryRecord { return historyRecordSchema.parse({ visitId: row.id, name: row.name, netId: row.net_id, recordedAt: new Date(row.recorded_at_ms).toISOString(), selfReported: true, ...(row.photo_available === undefined ? {} : { photoAvailable: row.photo_available === 1 }) }); }
function withDatabase<T>(directory: string, at: number, action: (db: ReturnType<typeof openAttendance>) => T) {
  if (!Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000) throw new HistoryFailure('history_unavailable');
  let db: ReturnType<typeof openAttendance> | undefined;
  try { db = openAttendance(directory); return action(db); }
  catch (error) { if (error instanceof HistoryFailure) throw error; throw new HistoryFailure('history_unavailable'); }
  finally { db?.close(); }
}
function waterMark(db: ReturnType<typeof openAttendance>) {
  const value = (db.prepare('SELECT coalesce(max(rowid),0) AS n FROM visits').get() as { n: number }).n;
  if (!Number.isSafeInteger(value) || value < 0) throw new HistoryFailure('history_unavailable');
  return value;
}
export function listVisits(directory: string, input: HistoryQuery, secret: string, at = Date.now()): Omit<HistoryResponse, 'requestId'> {
  const parsed = historyQuerySchema.safeParse({ ...input, limit: String(input.limit) });
  if (!parsed.success) throw new HistoryFailure('bad_request');
  const query = parsed.data;
  return withDatabase(directory, at, db => db.transaction(() => {
    const cursor = query.cursor ? decode(query.cursor, query, secret, at) : null;
    const snapshot = cursor?.snapshot ?? at, highWater = cursor?.highWater ?? waterMark(db);
    const range = bounds(query, at, snapshot, highWater);
    if (cursor) { range.sql += ' AND (recorded_at_ms < ? OR (recorded_at_ms = ? AND id < ?))'; range.values.push(cursor.lastTime, cursor.lastTime); }
    const values: (number | string)[] = [...range.values]; if (cursor) values.push(cursor.lastId);
    const metadata = query.photos === '1' ? ',EXISTS(SELECT 1 FROM visit_photos p WHERE p.visit_id=visits.id AND NOT EXISTS(SELECT 1 FROM visit_photo_revocations r WHERE r.visit_id=visits.id)) AS photo_available' : '';
    const rows = db.prepare(`SELECT id,name,net_id,recorded_at_ms${metadata} FROM visits WHERE ${range.sql} ORDER BY recorded_at_ms DESC,id DESC LIMIT ?`).all(...values, query.limit + 1) as Row[];
    const visible = rows.slice(0, query.limit), last = visible.at(-1);
    return { items: visible.map(record), snapshotAt: new Date(snapshot).toISOString(), timeZone: 'America/Chicago' as const, retentionDays: 30 as const, from: query.from ?? null, to: query.to ?? null,
      nextCursor: rows.length > query.limit && last ? encode({ v: 1, issued: snapshot, snapshot, highWater, lastTime: last.recorded_at_ms, lastId: last.id, filter: filterHash(query) }, secret) : null };
  })());
}
function csvCell(value: string) {
  // Tab-prefix risky text inside a quoted cell; full-width variants are checked.
  const dangerous = /^[\s\p{Cc}]*[=+\-@]/u.test(value.normalize('NFKC'));
  const safe = dangerous ? `\t${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function formatVisitsCsv(rows: readonly HistoryRecord[]): string {
  if (rows.length > 500) throw new HistoryFailure('export_too_large');
  const values = [['visit_id', 'recorded_at_utc', 'recorded_at_chicago', 'name', 'net_id', 'identity']];
  for (const input of rows) {
    const row = historyRecordSchema.parse(input);
    values.push([row.visitId, row.recordedAt, chicagoTimestamp(Date.parse(row.recordedAt)), row.name, row.netId, 'self-reported']);
  }
  return '\uFEFF' + values.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function exportVisits(directory: string, input: HistoryFilter, at = Date.now()) {
  const parsed = historyFilterSchema.safeParse(input);
  if (!parsed.success) throw new HistoryFailure('bad_request');
  return withDatabase(directory, at, db => db.transaction(() => {
    const range = bounds(parsed.data, at, at, waterMark(db));
    const rows = db.prepare(`SELECT id,name,net_id,recorded_at_ms FROM visits WHERE ${range.sql} ORDER BY recorded_at_ms DESC,id DESC LIMIT 501`).all(...range.values) as Row[];
    if (rows.length > 500) throw new HistoryFailure('export_too_large');
    return { csv: formatVisitsCsv(rows.map(record)), rowCount: rows.length, snapshotAt: new Date(at).toISOString() };
  })());
}

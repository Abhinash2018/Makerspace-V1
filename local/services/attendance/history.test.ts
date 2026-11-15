import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrate, openAttendance } from './database.ts';
import { chicagoMidnight, chicagoTimestamp, exportVisits, formatVisitsCsv, listVisits } from './history.ts';
import { retentionMs } from './visits.ts';

const at = Date.parse('2026-11-14T18:00:00Z'), secret = 'a'.repeat(64);
function insert(directory: string, count: number, timestamp = at - 1000) {
  const db = openAttendance(directory);
  try { db.transaction(() => { for (let index = 0; index < count; index++) db.prepare('INSERT INTO visits VALUES (?,?,?,?,1,?,?)').run(randomUUID(), `Synthetic visitor ${index}`, 'ab123', timestamp, randomUUID().replaceAll('-', '').repeat(2), 'b'.repeat(64)); })(); }
  finally { db.close(); }
}
it('converts Chicago DST boundaries and offset-bearing export timestamps independently of host timezone', () => {
  expect(chicagoMidnight('2026-03-09') - chicagoMidnight('2026-03-08')).toBe(23 * 3600000);
  expect(chicagoMidnight('2026-11-02') - chicagoMidnight('2026-11-01')).toBe(25 * 3600000);
  expect(chicagoTimestamp(Date.parse('2026-11-01T06:30:00Z'))).toBe('2026-11-01T01:30:00-05:00');
  expect(chicagoTimestamp(Date.parse('2026-11-01T07:30:00Z'))).toBe('2026-11-01T01:30:00-06:00');
  expect(() => chicagoMidnight('2026-02-29')).toThrow('bad_request');
});
it('paginates timestamp ties without duplicates/new arrivals, authenticates filters and expires cursors', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms005-pages-'));
  try {
    migrate(root); insert(root, 7, at);
    const first = listVisits(root, { limit: 3 }, secret, at); expect(first.items).toHaveLength(3); expect(first.nextCursor).not.toBeNull();
    insert(root, 2, at); // Same millisecond as the snapshot; row high-water must exclude them too.
    const second = listVisits(root, { limit: 3, cursor: first.nextCursor! }, secret, at + 1);
    const third = listVisits(root, { limit: 3, cursor: second.nextCursor! }, secret, at + 2);
    const ids = [...first.items, ...second.items, ...third.items].map(row => row.visitId);
    expect(ids).toHaveLength(7); expect(new Set(ids).size).toBe(7); expect(third.nextCursor).toBeNull();
    expect(() => listVisits(root, { limit: 2, cursor: first.nextCursor! }, secret, at + 1)).toThrow('bad_request');
    expect(() => listVisits(root, { limit: 3, cursor: first.nextCursor! }, 'c'.repeat(64), at + 1)).toThrow('bad_request');
    expect(() => listVisits(root, { limit: 3, cursor: first.nextCursor! }, secret, at + 600000)).toThrow('bad_request');
    expect(() => listVisits(root, { limit: 3, cursor: first.nextCursor!.slice(0, -1) + (first.nextCursor!.endsWith('A') ? 'B' : 'A') }, secret, at + 1)).toThrow('bad_request');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('filters retention on every read/export without cleanup and respects inclusive Chicago calendar days', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms005-retention-'));
  try {
    migrate(root); insert(root, 1, at - retentionMs); insert(root, 1, at - retentionMs + 1); insert(root, 1, chicagoMidnight('2026-11-14')); insert(root, 1, chicagoMidnight('2026-11-14') - 1);
    expect(listVisits(root, { limit: 50 }, secret, at).items).toHaveLength(3);
    expect(listVisits(root, { limit: 50, from: '2026-11-14', to: '2026-11-14' }, secret, at).items).toHaveLength(1);
    expect(exportVisits(root, {}, at).rowCount).toBe(3);
    const db = openAttendance(root); expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 4 }); db.close();
    expect(listVisits(root, { limit: 50 }, secret, at + 1).items).toHaveLength(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('quotes Unicode/delimiters, neutralizes formula prefixes and refuses oversized exports instead of truncating', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms005-csv-'));
  try {
    const base = { visitId: randomUUID(), netId: 'ab123', recordedAt: new Date(at).toISOString(), selfReported: true as const };
    const csv = formatVisitsCsv(['=SUM(1,1)', '+formula', '-formula', '@formula', '＝formula', 'Synthetic, "José"'].map(name => ({ ...base, name })));
    expect(csv.startsWith('\uFEFF"visit_id"')).toBe(true); expect(csv).toContain('"\t=SUM(1,1)"'); expect(csv).toContain('"\t＝formula"'); expect(csv).toContain('"Synthetic, ""José"""'); expect(csv).toContain('self-reported');
    migrate(root); insert(root, 500); expect(exportVisits(root, {}, at).rowCount).toBe(500);
    insert(root, 1); expect(() => exportVisits(root, {}, at)).toThrow('export_too_large');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

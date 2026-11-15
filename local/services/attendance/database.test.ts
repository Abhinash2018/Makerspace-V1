import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate, openAttendance, readiness } from './database.ts';
import { randomUUID } from 'node:crypto';

it('owns visit storage, reruns safely and refuses to replace unfamiliar data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-attendance-'));
  try {
    expect(readiness(root)).toEqual({ ready: false, code: 'db_unavailable' });
    migrate(root); migrate(root);
    expect(readiness(root)).toEqual({ ready: true, code: 'ready' });
    const db = new Database(path.join(root, 'attendance.sqlite'));
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get()).toEqual({ n: 5 });
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 3 });
    db.pragma('application_id = 42'); db.close();
    expect(readiness(root).ready).toBe(false);
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(path.join(root, 'attendance.sqlite'));
    expect(preserved.pragma('application_id', { simple: true })).toBe(42); preserved.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('upgrades known visit-only data and queues owned photo IDs when a visit is deleted', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms006-upgrade-'));
  try {
    const old = new Database(path.join(root, 'attendance.sqlite'));
    old.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(1,'attendance-foundation','2026-11-06T00:00:00.000Z'),(2,'attendance-manual-visits','2026-11-13T00:00:00.000Z');
      CREATE TABLE visits(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,net_id TEXT NOT NULL,recorded_at_ms INTEGER NOT NULL,self_reported INTEGER NOT NULL,attempt_digest TEXT NOT NULL UNIQUE,payload_digest TEXT NOT NULL) STRICT;
      CREATE INDEX visits_recorded_at ON visits(recorded_at_ms,id);`);
    const visitId = randomUUID(), photoId = randomUUID();
    old.prepare('INSERT INTO visits VALUES(?,?,?,?,1,?,?)').run(visitId, 'Synthetic migration visitor', 'ab123', 1000, 'a'.repeat(64), 'b'.repeat(64));
    old.pragma('application_id = 1297301505'); old.pragma('user_version = 2'); old.close();
    expect(readiness(root).code).toBe('migrations_required'); migrate(root); migrate(root);
    const db = openAttendance(root);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('SELECT name FROM visits').get()).toEqual({ name: 'Synthetic migration visitor' });
    db.prepare('INSERT INTO visit_photos VALUES(?,?,?,?,?,?,?,?,?)').run(visitId, photoId, 'c'.repeat(64), 'd'.repeat(64), 100, 64, 64, 'visit-photo-v1', 1001);
    db.prepare('INSERT INTO visit_photo_revocations VALUES(?,?)').run(visitId, 1002);
    db.prepare('DELETE FROM visits WHERE id=?').run(visitId);
    expect(db.prepare('SELECT count(*) AS n FROM visit_photos').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM visit_photo_revocations').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT photo_id FROM photo_cleanup').get()).toEqual({ photo_id: photoId }); db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('upgrades only known version-1 metadata and preserves its original migration record', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms002-upgrade-'));
  const file = path.join(root, 'attendance.sqlite');
  try {
    const old = new Database(file);
    old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(1, 'attendance-foundation', '2026-11-06T00:00:00.000Z');");
    old.pragma('application_id = 1297301505'); old.pragma('user_version = 1'); old.close();
    expect(readiness(root)).toEqual({ ready: false, code: 'migrations_required' });
    migrate(root); migrate(root);
    const db = new Database(file);
    expect(db.prepare('SELECT * FROM schema_migrations WHERE version=1').get()).toEqual({ version: 1, name: 'attendance-foundation', applied_at: '2026-11-06T00:00:00.000Z' });
    expect(db.prepare('SELECT count(*) AS n FROM visits').get()).toEqual({ n: 0 });
    db.pragma('user_version = 4'); db.close();
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(file); expect(preserved.pragma('user_version', { simple: true })).toBe(4); preserved.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

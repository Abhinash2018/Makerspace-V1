import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate, readiness } from './database.ts';

it('owns visit storage, reruns safely and refuses to replace unfamiliar data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-attendance-'));
  try {
    expect(readiness(root)).toEqual({ ready: false, code: 'db_unavailable' });
    migrate(root); migrate(root);
    expect(readiness(root)).toEqual({ ready: true, code: 'ready' });
    const db = new Database(path.join(root, 'attendance.sqlite'));
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()).toEqual([{ name: 'schema_migrations' }, { name: 'visits' }]);
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 2 });
    db.pragma('application_id = 42'); db.close();
    expect(readiness(root).ready).toBe(false);
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(path.join(root, 'attendance.sqlite'));
    expect(preserved.pragma('application_id', { simple: true })).toBe(42); preserved.close();
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
    db.pragma('user_version = 3'); db.close();
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(file); expect(preserved.pragma('user_version', { simple: true })).toBe(3); preserved.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

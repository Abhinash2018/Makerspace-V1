import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate, readiness } from './database.ts';

it('owns a metadata-only DB, reruns safely and refuses to replace unfamiliar data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-attendance-'));
  try {
    expect(readiness(root)).toEqual({ ready: false, code: 'db_unavailable' });
    migrate(root); migrate(root);
    expect(readiness(root)).toEqual({ ready: true, code: 'ready' });
    const db = new Database(path.join(root, 'attendance.sqlite'));
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([{ name: 'schema_migrations' }]);
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 1 });
    db.pragma('application_id = 42'); db.close();
    expect(readiness(root).ready).toBe(false);
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(path.join(root, 'attendance.sqlite'));
    expect(preserved.pragma('application_id', { simple: true })).toBe(42); preserved.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

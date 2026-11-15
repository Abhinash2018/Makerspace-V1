import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate, readiness } from './database.ts';

it('owns the document DB, reruns safely and refuses to replace unfamiliar data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-knowledge-'));
  try {
    expect(readiness(root)).toEqual({ ready: false, code: 'db_unavailable' });
    migrate(root); migrate(root);
    expect(readiness(root)).toEqual({ ready: true, code: 'ready' });
    const db = new Database(path.join(root, 'knowledge.sqlite'));
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get()).toEqual({ n: 6 });
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 2 });
    db.pragma('application_id = 42'); db.close();
    expect(readiness(root).ready).toBe(false);
    expect(() => migrate(root)).toThrow();
    const preserved = new Database(path.join(root, 'knowledge.sqlite'));
    expect(preserved.pragma('application_id', { simple: true })).toBe(42); preserved.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('upgrades only the known foundation and refuses future/history/layout/symlink changes without altering them', () => {
  for (const mode of ['foundation', 'future', 'history', 'layout']) {
    const root = mkdtempSync(path.join(tmpdir(), 'ms003-schema-'));
    try {
      const db = new Database(path.join(root, 'knowledge.sqlite'));
      db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
      db.prepare('INSERT INTO schema_migrations VALUES (1,?,?)').run(mode === 'history' ? 'unknown' : 'knowledge-foundation', new Date().toISOString());
      db.pragma('application_id = 1297301506'); db.pragma(`user_version = ${mode === 'future' ? 3 : 1}`);
      if (mode === 'layout') db.exec('CREATE TABLE foreign_data (value TEXT)');
      db.close();
      if (mode === 'foundation') { expect(readiness(root).code).toBe('migrations_required'); migrate(root); expect(readiness(root).ready).toBe(true); }
      else { expect(() => migrate(root)).toThrow(); const preserved = new Database(path.join(root, 'knowledge.sqlite')); expect(preserved.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 1 }); preserved.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
it('rejects a junction runtime directory before opening or migrating its target', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-junction-'));
  try {
    mkdirSync(path.join(root, 'target')); symlinkSync(path.join(root, 'target'), path.join(root, 'link'), 'junction');
    expect(() => migrate(path.join(root, 'link'))).toThrow();
    expect(readiness(path.join(root, 'link')).ready).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

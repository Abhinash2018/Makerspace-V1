import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrate, readiness } from './database.ts';
import { knowledgeSchema } from './schema.ts';

it('owns the document DB, reruns safely and refuses to replace unfamiliar data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-knowledge-'));
  try {
    expect(readiness(root)).toEqual({ ready: false, code: 'db_unavailable' });
    migrate(root); migrate(root);
    expect(readiness(root)).toEqual({ ready: true, code: 'ready' });
    const db = new Database(path.join(root, 'knowledge.sqlite'));
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get()).toEqual({ n: 6 });
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 3 });
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
it('preserves existing version-two sources and child references while enabling explicit OCR provenance', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms011-migration-'));
  try {
    const old = new Database(path.join(root, 'knowledge.sqlite'));
    old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
    old.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(1, 'knowledge-foundation', 'synthetic');
    old.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(2, 'knowledge-approved-documents', 'synthetic');
    old.exec(knowledgeSchema); old.pragma('application_id = 1297301506'); old.pragma('user_version = 2');
    old.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?)').run('policy', 1, 'Synthetic', 'a'.repeat(64), 1, '[]', 'synthetic', 'pdfjs-6.5.438');
    old.prepare('INSERT INTO current_documents VALUES (?,?)').run('policy', 1); old.close();
    expect(readiness(root).code).toBe('migrations_required'); migrate(root); migrate(root);
    const db = new Database(path.join(root, 'knowledge.sqlite'));
    expect(db.prepare('SELECT * FROM current_documents').get()).toEqual({ document_key: 'policy', version: 1 });
    expect(db.prepare('SELECT parser_version FROM document_versions').get()).toEqual({ parser_version: 'pdfjs-6.5.438' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(() => db.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?)').run('ocr', 1, 'Scanned synthetic', 'b'.repeat(64), 1, '[]', 'synthetic', 'windows-ocr-en-us-v1')).not.toThrow();
    expect(() => db.prepare("UPDATE document_versions SET parser_version='invented'").run()).toThrow(); db.close();
  } finally { expect(path.dirname(root)).toBe(path.resolve(tmpdir())); expect(path.basename(root).startsWith('ms011-migration-')).toBe(true); rmSync(root, { recursive: true, force: true }); }
});

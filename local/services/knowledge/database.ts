import { lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { checkRuntimePath, loadConfiguration } from '../../packages/config/index.mjs';
import { knowledgeSchema, knowledgeColumns } from './schema.ts';

const owner = 'knowledge-foundation';
const applicationId = 1297301506;
const migrations = [owner, 'knowledge-approved-documents'];
function filename(directory: string) {
  checkRuntimePath(path.parse(path.resolve(directory)).root, path.resolve(directory));
  const file = path.join(directory, 'knowledge.sqlite');
  try { if (lstatSync(file).isSymbolicLink()) throw new Error('db_unavailable'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return file;
}
function schemaVersion(db: Database.Database) {
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as { version: number; name: string }[];
  const version = db.pragma('user_version', { simple: true }) as number;
  if (db.pragma('application_id', { simple: true }) !== applicationId || ![1, 2].includes(version)
    || rows.length !== version || rows.some((row, index) => row.version !== index + 1 || row.name !== migrations[index])) throw new Error('migrations_required');
  const expected = version === 1 ? ['schema_migrations'] : Object.keys(knowledgeColumns).sort();
  const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  if (objects.map(row => row.name).join(',') !== expected.join(',')) throw new Error('migrations_required');
  for (const table of expected) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[];
    if (columns.map(row => `${row.name}:${row.type}`).join(',') !== knowledgeColumns[table]) throw new Error('migrations_required');
  }
  return version;
}
export function migrate(directory: string) {
  const file = filename(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new Database(file);
  try {
    db.pragma('busy_timeout = 1000');
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      const tables = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
      if (tables.length === 0 && db.pragma('application_id', { simple: true }) === 0 && db.pragma('user_version', { simple: true }) === 0) {
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(1, owner, new Date().toISOString());
        db.pragma(`application_id = ${applicationId}`); db.pragma('user_version = 1');
      }
      if (schemaVersion(db) === 1) {
        db.exec(knowledgeSchema);
        db.prepare('INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(2, migrations[1]!, new Date().toISOString());
        db.pragma('user_version = 2');
      }
      if (schemaVersion(db) !== 2) throw new Error('migrations_required');
    }).immediate();
    db.pragma('journal_mode = WAL');
  } finally { db.close(); }
}
export function readiness(directory: string): { ready: boolean; code: 'ready' | 'db_unavailable' | 'migrations_required' } {
  let db: Database.Database | undefined;
  try {
    db = new Database(filename(directory), { fileMustExist: true });
    db.pragma('busy_timeout = 1000');
    if (schemaVersion(db) !== 2) return { ready: false, code: 'migrations_required' };
    return { ready: true, code: 'ready' };
  } catch { return { ready: false, code: db ? 'migrations_required' : 'db_unavailable' }; }
  finally { db?.close(); }
}
export function openKnowledge(directory: string) {
  const db = new Database(filename(directory), { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 1000'); db.pragma('foreign_keys = ON'); db.pragma('secure_delete = ON');
    if (schemaVersion(db) !== 2) throw new Error('migrations_required');
    return db;
  } catch (error) { db.close(); throw error; }
}
if (import.meta.main) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--migrate') throw new Error('usage');
    migrate(loadConfiguration().runtime.knowledge);
    console.log('Knowledge migrations are current.');
  } catch { console.error('Knowledge migration failed; check configuration, file access and database ownership.'); process.exitCode = 1; }
}

import { lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfiguration } from '../../packages/config/index.mjs';

const owner = 'knowledge-foundation';
const applicationId = 1297301506;
function filename(directory: string) {
  const file = path.join(directory, 'knowledge.sqlite');
  try { if (lstatSync(file).isSymbolicLink()) throw new Error('db_unavailable'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return file;
}
function current(db: Database.Database) {
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as { version: number; name: string }[];
  return db.pragma('application_id', { simple: true }) === applicationId
    && db.pragma('user_version', { simple: true }) === 1
    && rows.length === 1 && rows[0]?.version === 1 && rows[0]?.name === owner;
}
export function migrate(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new Database(filename(directory));
  try {
    db.pragma('busy_timeout = 1000');
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    if (tables.length === 0 && db.pragma('application_id', { simple: true }) === 0 && db.pragma('user_version', { simple: true }) === 0) {
      db.transaction(() => {
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(1, owner, new Date().toISOString());
        db.pragma(`application_id = ${applicationId}`); db.pragma('user_version = 1');
      })();
    }
    if (!current(db)) throw new Error('migrations_required');
    db.pragma('journal_mode = WAL');
  } finally { db.close(); }
}
export function readiness(directory: string): { ready: boolean; code: 'ready' | 'db_unavailable' | 'migrations_required' } {
  let db: Database.Database | undefined;
  try {
    db = new Database(filename(directory), { fileMustExist: true });
    if (!current(db)) return { ready: false, code: 'migrations_required' };
    return { ready: true, code: 'ready' };
  } catch { return { ready: false, code: db ? 'migrations_required' : 'db_unavailable' }; }
  finally { db?.close(); }
}
if (import.meta.main) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--migrate') throw new Error('usage');
    migrate(loadConfiguration().runtime.knowledge);
    console.log('Knowledge migrations are current.');
  } catch { console.error('Knowledge migration failed; check configuration, file access and database ownership.'); process.exitCode = 1; }
}

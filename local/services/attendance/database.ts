import { lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { checkRuntimePath, loadConfiguration } from '../../packages/config/index.mjs';
import { photoSchema, photoColumns } from './photo-schema.ts';

const owner = 'attendance-foundation';
const migrationNames = [owner, 'attendance-manual-visits', 'attendance-consented-photos', 'attendance-face-attempts'];
const applicationId = 1297301505;
function filename(directory: string) {
  checkRuntimePath(path.parse(path.resolve(directory)).root, path.resolve(directory));
  const file = path.join(directory, 'attendance.sqlite');
  try { if (lstatSync(file).isSymbolicLink()) throw new Error('db_unavailable'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return file;
}
function schemaVersion(db: Database.Database) {
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as { version: number; name: string }[];
  const version = db.pragma('user_version', { simple: true }) as number;
  if (db.pragma('application_id', { simple: true }) !== applicationId || ![1, 2, 3, 4].includes(version)
    || rows.length !== version || rows.some((row, index) => row.version !== index + 1 || row.name !== migrationNames[index])) throw new Error('migrations_required');
  const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  const expected = (version === 1 ? ['schema_migrations'] : version === 2 ? ['schema_migrations', 'visits', 'visits_recorded_at']
    : ['schema_migrations', 'visits', 'visits_recorded_at', 'visits_photo_cleanup', ...Object.keys(photoColumns), ...(version === 4 ? ['face_attempts'] : [])]).sort();
  if (objects.map(row => row.name).join(',') !== expected.join(',')) throw new Error('migrations_required');
  if (version >= 2) {
    const columns = db.prepare('PRAGMA table_info(visits)').all() as { name: string; type: string }[];
    if (columns.map(row => `${row.name}:${row.type}`).join(',') !== 'id:TEXT,name:TEXT,net_id:TEXT,recorded_at_ms:INTEGER,self_reported:INTEGER,attempt_digest:TEXT,payload_digest:TEXT') throw new Error('migrations_required');
  }
  if (version >= 3) for (const [table, expectedColumns] of Object.entries(photoColumns)) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[];
    if (columns.map(row => `${row.name}:${row.type}`).join(',') !== expectedColumns) throw new Error('migrations_required');
  }
  if (version === 4) {
    const faceColumns = db.prepare('PRAGMA table_info(face_attempts)').all() as { name: string; type: string }[];
    if (faceColumns.map(row => `${row.name}:${row.type}`).join(',') !== 'visit_id:TEXT,ticket_digest:TEXT') throw new Error('migrations_required');
  }
  return version;
}
export function migrate(directory: string) {
  const file = filename(directory);
  mkdirSync(directory, { recursive: true });
  const db = new Database(file);
  try {
    db.pragma('busy_timeout = 1000');
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
      if (objects.length === 0 && db.pragma('application_id', { simple: true }) === 0 && db.pragma('user_version', { simple: true }) === 0) {
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(1, owner, new Date().toISOString());
        db.pragma(`application_id = ${applicationId}`); db.pragma('user_version = 1');
      }
      if (schemaVersion(db) === 1) {
        db.exec(`CREATE TABLE visits (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
          net_id TEXT NOT NULL CHECK(length(net_id) BETWEEN 2 AND 32),
          recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
          self_reported INTEGER NOT NULL DEFAULT 1 CHECK(self_reported = 1),
          attempt_digest TEXT NOT NULL UNIQUE CHECK(length(attempt_digest) = 64),
          payload_digest TEXT NOT NULL CHECK(length(payload_digest) = 64)
        ) STRICT;
        CREATE INDEX visits_recorded_at ON visits(recorded_at_ms, id);`);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(2, migrationNames[1]!, new Date().toISOString());
        db.pragma('user_version = 2');
      }
      if (schemaVersion(db) === 2) {
        db.exec(photoSchema);
        db.prepare('INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(3, migrationNames[2]!, new Date().toISOString());
        db.pragma('user_version = 3');
      }
      if (schemaVersion(db) === 3) {
        db.exec('CREATE TABLE face_attempts(visit_id TEXT PRIMARY KEY NOT NULL REFERENCES visits(id) ON DELETE CASCADE,ticket_digest TEXT NOT NULL CHECK(length(ticket_digest)=64)) STRICT');
        db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(4, migrationNames[3]!, new Date().toISOString());
        db.pragma('user_version=4');
      }
      if (schemaVersion(db) !== 4) throw new Error('migrations_required');
    }).immediate();
    db.pragma('journal_mode = WAL');
    db.pragma('secure_delete = ON');
  } finally { db.close(); }
}
export function readiness(directory: string): { ready: boolean; code: 'ready' | 'db_unavailable' | 'migrations_required' } {
  let db: Database.Database | undefined;
  try {
    db = new Database(filename(directory), { fileMustExist: true });
    db.pragma('busy_timeout = 1000');
    if (schemaVersion(db) !== 4) return { ready: false, code: 'migrations_required' };
    return { ready: true, code: 'ready' };
  } catch { return { ready: false, code: db ? 'migrations_required' : 'db_unavailable' }; }
  finally { db?.close(); }
}
export function openAttendance(directory: string) {
  const db = new Database(filename(directory), { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 1000');
    db.pragma('secure_delete = ON');
    db.pragma('foreign_keys = ON');
    if (schemaVersion(db) !== 4) throw new Error('migrations_required');
    return db;
  } catch (error) { db.close(); throw error; }
}
if (import.meta.main) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--migrate') throw new Error('usage');
    migrate(loadConfiguration().runtime.attendance);
    console.log('Attendance migrations are current.');
  } catch { console.error('Attendance migration failed; check configuration, file access and database ownership.'); process.exitCode = 1; }
}

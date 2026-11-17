import { mkdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { checkRuntimePath, loadConfiguration } from '../../packages/config/index.mjs';
import { FaceFailure } from './settings.ts';

const columns = 'id:TEXT,generation:TEXT,attempt_digest:TEXT,identity_digest:TEXT,input_digest:TEXT,code_digest:TEXT,created_at:INTEGER,expires_at:INTEGER,model_id:TEXT,ciphertext:BLOB';
function file(directory: string) {
  checkRuntimePath(path.parse(path.resolve(directory)).root, directory);
  const target = path.join(directory, 'face.sqlite');
  try { if (lstatSync(target).isSymbolicLink()) throw new FaceFailure(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return target;
}
function check(db: Database.Database) {
  if (db.pragma('application_id', { simple: true }) !== 1297301507 || db.pragma('user_version', { simple: true }) !== 1) throw new FaceFailure();
  const names = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  if (names.map(n => n.name).join(',') !== 'enrollments,face_expiry,schema_migrations') throw new FaceFailure();
  const fields = db.prepare('PRAGMA table_info(enrollments)').all() as { name: string; type: string }[];
  if (fields.map(f => `${f.name}:${f.type}`).join(',') !== columns) throw new FaceFailure();
  const migrations = db.prepare('SELECT version,name FROM schema_migrations').all();
  if (JSON.stringify(migrations) !== JSON.stringify([{ version: 1, name: 'face-encrypted-enrollments' }])) throw new FaceFailure();
}
export function openFace(directory: string) {
  const db = new Database(file(directory), { fileMustExist: true });
  try { db.pragma('busy_timeout=1000'); db.pragma('secure_delete=ON'); check(db); return db; }
  catch { db.close(); throw new FaceFailure(); }
}
export function migrateFace(directory: string) {
  const target = file(directory); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new Database(target);
  try {
    db.transaction(() => {
      const empty = (db.prepare('SELECT count(*) AS n FROM sqlite_schema').get() as { n: number }).n === 0;
      if (empty && db.pragma('user_version', { simple: true }) === 0 && db.pragma('application_id', { simple: true }) === 0) {
        db.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL);
          INSERT INTO schema_migrations VALUES(1,'face-encrypted-enrollments');
          CREATE TABLE enrollments(id TEXT PRIMARY KEY NOT NULL,generation TEXT NOT NULL,attempt_digest TEXT NOT NULL UNIQUE,
          identity_digest TEXT UNIQUE,input_digest TEXT,code_digest TEXT UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,model_id TEXT NOT NULL,ciphertext BLOB) STRICT;
          CREATE INDEX face_expiry ON enrollments(expires_at);`);
        db.pragma('application_id=1297301507'); db.pragma('user_version=1');
      }
      check(db);
    }).immediate();
    db.pragma('journal_mode=WAL'); db.pragma('secure_delete=ON');
  } finally { db.close(); }
}
if (import.meta.main) {
  try { if (process.argv.length !== 3 || process.argv[2] !== '--migrate') throw new FaceFailure(); migrateFace(loadConfiguration().runtime.face); console.log('Face migrations are current.'); }
  catch { console.error('Face migration failed. Check owned storage; no reset was performed.'); process.exitCode = 1; }
}

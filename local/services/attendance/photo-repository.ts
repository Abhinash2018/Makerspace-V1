import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { internalPhotoRemovalSchema, internalPhotoUploadSchema, photoConsentVersion, photoParamsSchema, type InternalPhotoUpload, type PhotoRemoval, type PhotoSaved } from '../../packages/contracts/photos.ts';
import { openAttendance } from './database.ts';
import { retentionMs } from './visits.ts';
import { PhotoFailure, sanitizePhoto } from './photo-codec.ts';
import { imageHash, readPrivatePhoto, unlinkPrivatePhoto, writePrivatePhoto } from './photo-files.ts';

type Db = ReturnType<typeof openAttendance>;
type Visit = { id: string; recorded_at_ms: number; attempt_digest: string };
type Photo = { visit_id: string; photo_id: string; input_hash: string; sha256: string; byte_length: number; width: number; height: number; consent_version: string; consented_at_ms: number };
type Proof = { idempotencyKey: string; sessionScope: string };
function database<T>(directory: string, action: (db: Db) => T): T {
  let db: Db | undefined;
  try { db = openAttendance(directory); return action(db); }
  catch (error) { if (error instanceof PhotoFailure) throw error; throw new PhotoFailure('photo_unavailable'); }
  finally { db?.close(); }
}
function clock(now: () => number): number {
  const at = now(); if (!Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000 - retentionMs) throw new PhotoFailure('photo_unavailable'); return at;
}
function verifyVisit(db: Db, visitId: string, at: number, proof?: Proof): Visit {
  const visit = db.prepare('SELECT id,recorded_at_ms,attempt_digest FROM visits WHERE id=?').get(visitId) as Visit | undefined;
  if (!visit || visit.recorded_at_ms <= at - retentionMs || visit.recorded_at_ms > at) throw new PhotoFailure('photo_not_found');
  if (proof) {
    const expected = createHash('sha256').update(JSON.stringify([proof.sessionScope, proof.idempotencyKey])).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(visit.attempt_digest) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(visit.attempt_digest, 'hex'))) throw new PhotoFailure('photo_not_found');
  }
  return visit;
}
function photo(db: Db, visitId: string) { return db.prepare('SELECT * FROM visit_photos WHERE visit_id=?').get(visitId) as Photo | undefined; }
function saved(row: Photo, visit: Visit, replayed: boolean): Omit<PhotoSaved, 'requestId'> {
  return { visitId: visit.id, photoId: row.photo_id, saved: true, replayed, expiresAt: new Date(visit.recorded_at_ms + retentionMs).toISOString(), consentVersion: photoConsentVersion };
}
function existing(db: Db, directory: string, input: InternalPhotoUpload, hash: string, at: number) {
  const visit = verifyVisit(db, input.visitId, at, input);
  if (db.prepare('SELECT 1 FROM visit_photo_revocations WHERE visit_id=?').get(visit.id)) throw new PhotoFailure('photo_conflict');
  const row = photo(db, visit.id);
  if (row) {
    if (row.input_hash !== hash) throw new PhotoFailure('photo_conflict');
    readPrivatePhoto(directory, row.photo_id, row.byte_length, row.sha256);
    return { visit, replay: saved(row, visit, true) };
  }
  if (at - visit.recorded_at_ms >= 300000) throw new PhotoFailure('photo_not_found');
  const count = db.prepare('SELECT (SELECT count(*) FROM visit_photos)+(SELECT count(*) FROM photo_cleanup) AS n').get() as { n: number };
  if (count.n >= 1000) throw new PhotoFailure('photo_unavailable');
  return { visit, replay: null };
}
export function createPhotoRepository(directory: string, now = Date.now) {
  let active = false;
  function unlinkQueued(db: Db, id: string): boolean {
    try {
      if (db.prepare('SELECT 1 FROM visit_photos WHERE photo_id=?').get(id)) return false;
      unlinkPrivatePhoto(directory, id); db.prepare('DELETE FROM photo_cleanup WHERE photo_id=?').run(id); return true;
    } catch { return false; }
  }
  function cleanup() {
    return database(directory, db => {
      const queued = db.prepare('SELECT photo_id FROM photo_cleanup ORDER BY queued_at_ms,photo_id LIMIT 100').all() as { photo_id: string }[];
      let removed = 0, failed = false;
      for (const row of queued) { if (unlinkQueued(db, row.photo_id)) removed++; else failed = true; }
      const pending = (db.prepare('SELECT count(*) AS n FROM photo_cleanup').get() as { n: number }).n;
      return { removed, pending, failed };
    });
  }
  async function save(value: InternalPhotoUpload, signal?: AbortSignal) {
    const parsed = internalPhotoUploadSchema.safeParse(value);
    if (!parsed.success) throw new PhotoFailure('invalid_photo');
    if (active) throw new PhotoFailure('rate_limited');
    active = true;
    const input = parsed.data, raw = Buffer.from(input.image, 'base64'), hash = imageHash(raw);
    let owned: string | undefined;
    try {
      signal?.throwIfAborted();
      const initial = database(directory, db => existing(db, directory, input, hash, clock(now)));
      if (initial.replay) return initial.replay;
      const normalized = await sanitizePhoto(raw, signal ? { signal } : {});
      signal?.throwIfAborted();
      const result = database(directory, db => db.transaction(() => {
        const at = clock(now), state = existing(db, directory, input, hash, at);
        if (state.replay) return state.replay;
        const id = randomUUID(); writePrivatePhoto(directory, id, normalized.bytes); owned = id;
        db.prepare('INSERT INTO visit_photos VALUES (?,?,?,?,?,?,?,?,?)').run(input.visitId, id, hash, imageHash(normalized.bytes), normalized.bytes.length, normalized.width, normalized.height, photoConsentVersion, at);
        return saved(photo(db, input.visitId)!, state.visit, false);
      }).immediate());
      owned = undefined; return result;
    } catch (error) {
      if (owned) {
        const id = owned;
        try { database(directory, db => { if (db.prepare('SELECT 1 FROM visit_photos WHERE photo_id=?').get(id)) return;
          try { unlinkPrivatePhoto(directory, id); } catch { db.prepare('INSERT OR IGNORE INTO photo_cleanup VALUES (?,?,?)').run(id, input.visitId, clock(now)); }
        }); } catch { /* Inactive crash/orphan lifecycle is reviewed in MS-010. */ }
      }
      if (error instanceof PhotoFailure) throw error;
      throw new PhotoFailure('photo_unavailable');
    } finally { active = false; }
  }
  function read(visitId: string) {
    const parsed = photoParamsSchema.safeParse({ visitId }); if (!parsed.success) throw new PhotoFailure('photo_not_found');
    return database(directory, db => db.transaction(() => {
      verifyVisit(db, parsed.data.visitId, clock(now));
      const row = photo(db, parsed.data.visitId); if (!row || db.prepare('SELECT 1 FROM visit_photo_revocations WHERE visit_id=?').get(parsed.data.visitId)) throw new PhotoFailure('photo_not_found');
      const bytes = readPrivatePhoto(directory, row.photo_id, row.byte_length, row.sha256);
      return { visitId: row.visit_id, photoId: row.photo_id, mime: 'image/jpeg' as const, width: row.width, height: row.height, byteLength: bytes.length, sha256: row.sha256, image: bytes.toString('base64') };
    })());
  }
  function remove(value: PhotoRemoval) {
    const parsed = internalPhotoRemovalSchema.safeParse(value); if (!parsed.success) throw new PhotoFailure('photo_not_found');
    return database(directory, db => {
      const input = parsed.data, at = clock(now);
      db.transaction(() => {
        verifyVisit(db, input.visitId, at, input.actor === 'visitor' ? input : undefined);
        db.prepare('INSERT OR IGNORE INTO visit_photo_revocations VALUES (?,?)').run(input.visitId, at);
        const row = photo(db, input.visitId);
        if (row) { db.prepare('INSERT OR IGNORE INTO photo_cleanup VALUES (?,?,?)').run(row.photo_id, input.visitId, at); db.prepare('DELETE FROM visit_photos WHERE visit_id=?').run(input.visitId); }
      }).immediate();
      const queued = db.prepare('SELECT photo_id FROM photo_cleanup WHERE visit_id=?').all(input.visitId) as { photo_id: string }[];
      for (const row of queued) unlinkQueued(db, row.photo_id);
      return { removed: true as const, pendingCleanup: !!db.prepare('SELECT 1 FROM photo_cleanup WHERE visit_id=?').get(input.visitId) };
    });
  }
  return { save, read, remove, cleanup };
}

export const photoSchema = `
CREATE TABLE visit_photos (
 visit_id TEXT PRIMARY KEY NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
 photo_id TEXT NOT NULL UNIQUE, input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 4 AND 262144),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 640), height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 640),
 consent_version TEXT NOT NULL CHECK(consent_version='visit-photo-v1'), consented_at_ms INTEGER NOT NULL CHECK(consented_at_ms>=0)
) STRICT;
CREATE TABLE visit_photo_revocations (
 visit_id TEXT PRIMARY KEY NOT NULL REFERENCES visits(id) ON DELETE CASCADE, revoked_at_ms INTEGER NOT NULL CHECK(revoked_at_ms>=0)
) STRICT;
CREATE TABLE photo_cleanup (photo_id TEXT PRIMARY KEY NOT NULL, visit_id TEXT NOT NULL, queued_at_ms INTEGER NOT NULL CHECK(queued_at_ms>=0)) STRICT;
CREATE TRIGGER visits_photo_cleanup BEFORE DELETE ON visits BEGIN
 INSERT OR IGNORE INTO photo_cleanup(photo_id,visit_id,queued_at_ms) SELECT photo_id,visit_id,consented_at_ms FROM visit_photos WHERE visit_id=OLD.id;
END;`;
export const photoColumns: Record<string, string> = {
  visit_photos: 'visit_id:TEXT,photo_id:TEXT,input_hash:TEXT,sha256:TEXT,byte_length:INTEGER,width:INTEGER,height:INTEGER,consent_version:TEXT,consented_at_ms:INTEGER',
  visit_photo_revocations: 'visit_id:TEXT,revoked_at_ms:INTEGER',
  photo_cleanup: 'photo_id:TEXT,visit_id:TEXT,queued_at_ms:INTEGER',
};

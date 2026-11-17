import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { faceConsentVersion, faceIdentitySchema } from '../../packages/contracts/face.ts';
import { FaceFailure, loadFaceSettings, modelId } from './settings.ts';
import { openFace } from './database.ts';
import { normalizeEmbedding, cosine, selectMatch } from './vectors.ts';

export const enrollmentRetention = 90 * 24 * 60 * 60_000;
type Identity = { name: string; netId: string };
type Proof = { visitId: string; sessionScope: string; idempotencyKey: string };
type Row = { id: string; generation: string; attempt_digest: string; identity_digest: string | null; input_digest: string | null; code_digest: string | null; created_at: number; expires_at: number; model_id: string; ciphertext: Buffer | null };
export function createFaceRepository(directory: string, now = Date.now) {
  const { key } = loadFaceSettings(directory, false);
  const digest = (purpose: string, value: unknown) => createHmac('sha256', key).update(JSON.stringify([purpose, value])).digest('hex');
  const attempt = (proof: Proof) => digest('attempt', [proof.visitId, proof.sessionScope, proof.idempotencyKey]);
  const code = (id: string) => createHmac('sha256', key).update(`withdrawal-code-v1:${id}`).digest('base64url');
  function database<T>(action: (db: ReturnType<typeof openFace>) => T): T {
    if (!loadFaceSettings(directory, false).key.equals(key)) throw new FaceFailure();
    let db: ReturnType<typeof openFace> | undefined;
    try { db = openFace(directory); return action(db); }
    catch (error) { if (error instanceof FaceFailure) throw error; throw new FaceFailure(); }
    finally { db?.close(); }
  }
  function clock() { const at = now(); if (!Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000 - enrollmentRetention) throw new FaceFailure(); return at; }
  const aad = (row: Row) => Buffer.from(JSON.stringify([1, row.id, row.generation, row.attempt_digest, row.identity_digest, row.input_digest, row.code_digest, row.created_at, row.expires_at, row.model_id]));
  function decrypt(row: Row): Identity & { embedding: number[] } {
    try {
      if (!row.ciphertext || row.ciphertext.length < 29 || row.ciphertext.length > 16384 || row.model_id !== modelId) throw new FaceFailure();
      const cipher = createDecipheriv('aes-256-gcm', key, row.ciphertext.subarray(0, 12));
      cipher.setAAD(aad(row)); cipher.setAuthTag(row.ciphertext.subarray(12, 28));
      const payload: unknown = JSON.parse(Buffer.concat([cipher.update(row.ciphertext.subarray(28)), cipher.final()]).toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).sort().join(',') !== 'embedding,name,netId') throw new FaceFailure();
      const item = payload as Identity & { embedding: number[] };
      const identity = faceIdentitySchema.omit({ requestId: true }).parse({ name: item.name, netId: item.netId });
      if (!Array.isArray(item.embedding) || item.embedding.some(n => typeof n !== 'number') || Math.abs(Math.hypot(...item.embedding) - 1) > 1e-5) throw new FaceFailure();
      const embedding = normalizeEmbedding(item.embedding);
      if (row.identity_digest !== digest('identity', identity.netId)) throw new FaceFailure();
      return { ...identity, embedding };
    } catch { throw new FaceFailure(); }
  }
  function activeRows(db: ReturnType<typeof openFace>) {
    const at = clock();
    return db.prepare('SELECT * FROM enrollments WHERE ciphertext IS NOT NULL AND expires_at>? AND created_at<=? ORDER BY id LIMIT 1001').all(at, at) as Row[];
  }
  function receipt(row: Row, replayed: boolean) { return { enrollmentId: row.id, expiresAt: new Date(row.expires_at).toISOString(), withdrawalCode: code(row.id), consentVersion: faceConsentVersion, replayed }; }
  function existing(db: ReturnType<typeof openFace>, proof: Proof, image: Uint8Array) {
    const row = db.prepare('SELECT * FROM enrollments WHERE attempt_digest=?').get(attempt(proof)) as Row | undefined;
    if (!row) return null;
    if (!row.ciphertext || row.expires_at <= clock() || row.input_digest !== digest('image', Buffer.from(image).toString('base64'))) throw new FaceFailure('face_conflict');
    decrypt(row); return receipt(row, true);
  }
  return {
    knownProof: (proof: Proof) => database(db => !!db.prepare('SELECT 1 FROM enrollments WHERE attempt_digest=?').get(attempt(proof))),
    replay: (proof: Proof, image: Uint8Array) => database(db => existing(db, proof, image)),
    enroll(proof: Proof, image: Uint8Array, identity: Identity, vector: number[]) {
      return database(db => db.transaction(() => {
        const replay = existing(db, proof, image); if (replay) return replay;
        const rows = activeRows(db); if (rows.length >= 1000) throw new FaceFailure();
        const embedding = normalizeEmbedding(vector), identityDigest = digest('identity', identity.netId);
        for (const row of rows) if (row.identity_digest === identityDigest || cosine(embedding, decrypt(row).embedding) >= 0.65) throw new FaceFailure('face_conflict');
        // Expired identities stop reserving their uniqueness before new publication.
        db.prepare('DELETE FROM enrollments WHERE expires_at<=?').run(clock());
        const at = clock(), id = randomUUID();
        const row: Row = { id, generation: randomUUID(), attempt_digest: attempt(proof), identity_digest: identityDigest, input_digest: digest('image', Buffer.from(image).toString('base64')),
          code_digest: digest('withdrawal', code(id)), created_at: at, expires_at: at + enrollmentRetention, model_id: modelId, ciphertext: null };
        const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad(row));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...identity, embedding })), cipher.final()]);
        row.ciphertext = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
        db.prepare('INSERT INTO enrollments VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.id, row.generation, row.attempt_digest, row.identity_digest, row.input_digest, row.code_digest, row.created_at, row.expires_at, row.model_id, row.ciphertext);
        return receipt(row, false);
      }).immediate());
    },
    match(vector: number[]) { return database(db => {
      const rows = activeRows(db); if (rows.length > 1000) throw new FaceFailure();
      const id = selectMatch(normalizeEmbedding(vector), rows.map(row => ({ id: row.id, embedding: decrypt(row).embedding })));
      const row = rows.find(row => row.id === id); return row ? { enrollmentId: row.id, generation: row.generation } : null;
    }); },
    consume(id: string, generation: string) { return database(db => {
      const row = db.prepare('SELECT * FROM enrollments WHERE id=?').get(id) as Row | undefined;
      if (!row || row.generation !== generation || !row.ciphertext || row.expires_at <= clock() || row.created_at > clock()) throw new FaceFailure('face_not_found');
      const { name, netId } = decrypt(row); return { name, netId };
    }); },
    withdraw(input: { code: string } | Proof | { id: string }) { return database(db => db.transaction(() => {
      const row = 'code' in input ? db.prepare('SELECT * FROM enrollments WHERE code_digest=?').get(digest('withdrawal', input.code)) as Row | undefined
        : 'id' in input ? db.prepare('SELECT * FROM enrollments WHERE id=?').get(input.id) as Row | undefined
          : db.prepare('SELECT * FROM enrollments WHERE attempt_digest=?').get(attempt(input)) as Row | undefined;
      if (row) db.prepare('UPDATE enrollments SET ciphertext=NULL,identity_digest=NULL,input_digest=NULL,code_digest=NULL,generation=? WHERE id=?').run(randomUUID(), row.id);
      else if (!('code' in input) && !('id' in input)) {
        if ((db.prepare('SELECT count(*) AS n FROM enrollments').get() as { n: number }).n >= 10000) throw new FaceFailure();
        const at = clock(); db.prepare('INSERT OR IGNORE INTO enrollments VALUES(?,?,?,NULL,NULL,NULL,?,?,?,NULL)').run(randomUUID(), randomUUID(), attempt(input), at, at + enrollmentRetention, modelId);
      }
      return { removed: true as const };
    }).immediate()); },
    list(after?: string) { return database(db => {
      const rows = activeRows(db).filter(row => !after || row.id > after).slice(0, 26);
      return { records: rows.slice(0, 25).map(row => { const identity = decrypt(row); return { enrollmentId: row.id, name: identity.name, netId: identity.netId, expiresAt: new Date(row.expires_at).toISOString() }; }), next: rows.length > 25 ? rows[24]!.id : null };
    }); },
    cleanup() { return database(db => db.prepare('DELETE FROM enrollments WHERE expires_at<=?').run(clock()).changes); },
  };
}

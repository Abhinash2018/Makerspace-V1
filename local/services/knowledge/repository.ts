import { createHash } from 'node:crypto';
import { openKnowledge } from './database.ts';
import { indexKey, normalizeVector, type IndexIdentity } from './embeddings.ts';
import { chunkerVersion, type DocumentChunk } from './chunks.ts';
import { parseEmbeddingSettings } from './settings.ts';
import type { EmbeddingSettings } from './settings.ts';

export const corpusLimits = Object.freeze({ documents: 50, versions: 10, indexes: 4, currentChunks: 5000, totalChunks: 20000 });
export class CorpusFailure extends Error {
  readonly code: 'invalid_document' | 'version_conflict' | 'corpus_limits' | 'index_incomplete' | 'index_incompatible';
  constructor(code: CorpusFailure['code']) { super(code); this.code = code; }
}
export type DocumentVersion = Readonly<{ key: string; version: number; title: string; sourceHash: string; pageCount: number; emptyPages: readonly number[]; importedAt: string; parserVersion: string }>;
export type PreparedDocument = Readonly<{ key: string; title: string; sourceHash: string; pageCount: number; emptyPages: readonly number[];
  expectedVersion: number; chunks: readonly DocumentChunk[]; vectors: readonly (readonly number[])[] }>;
export type EvidenceChunk = Readonly<{ chunkId: string; document: DocumentVersion; ordinal: number; page: number; text: string; vector: readonly number[] }>;
type VersionRow = { document_key: string; version: number; title: string; source_hash: string; page_count: number; empty_pages: string; imported_at: string; parser_version: string };
const digest = /^[a-f0-9]{64}$/;
export function validateDocumentMetadata(input: { key: string; title: string }) {
  if (typeof input.key !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input.key) || typeof input.title !== 'string'
    || !input.title.trim() || input.title !== input.title.trim() || input.title.length > 160 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(input.title)) throw new CorpusFailure('invalid_document');
}
export function validateIndex(identity: IndexIdentity): IndexIdentity {
  parseEmbeddingSettings({ version: 1, model: identity.model, cpuOnly: true, documentPrefix: identity.documentPrefix, queryPrefix: identity.queryPrefix });
  if (!digest.test(identity.digest) || !Number.isInteger(identity.dimensions) || identity.dimensions < 1 || identity.dimensions > 4096 || identity.chunkerVersion !== chunkerVersion) throw new CorpusFailure('index_incompatible');
  return Object.freeze({ model: identity.model, digest: identity.digest, dimensions: identity.dimensions,
    documentPrefix: identity.documentPrefix, queryPrefix: identity.queryPrefix, chunkerVersion: identity.chunkerVersion });
}
function document(row: VersionRow): DocumentVersion {
  return Object.freeze({ key: row.document_key, version: row.version, title: row.title, sourceHash: row.source_hash,
    pageCount: row.page_count, emptyPages: Object.freeze(JSON.parse(row.empty_pages) as number[]), importedAt: row.imported_at, parserVersion: row.parser_version });
}
function currentRows(db: ReturnType<typeof openKnowledge>) {
  return db.prepare('SELECT v.* FROM current_documents c JOIN document_versions v USING(document_key,version) ORDER BY document_key').all() as VersionRow[];
}
export function currentDocuments(directory: string): readonly DocumentVersion[] {
  const db = openKnowledge(directory);
  try { return Object.freeze(currentRows(db).map(document)); } finally { db.close(); }
}
export function publishDocuments(directory: string, identityInput: IndexIdentity, prepared: readonly PreparedDocument[]): readonly DocumentVersion[] {
  const identity = validateIndex(identityInput), bucket = indexKey(identity);
  if (!prepared.length || prepared.length > corpusLimits.documents || new Set(prepared.map(item => item.key)).size !== prepared.length) throw new CorpusFailure('invalid_document');
  for (const item of prepared) {
    validateDocumentMetadata(item);
    if (!digest.test(item.sourceHash) || !Number.isInteger(item.pageCount) || item.pageCount < 1 || item.pageCount > 100
      || !Number.isInteger(item.expectedVersion) || item.expectedVersion < 0 || item.expectedVersion > 10
      || !Array.isArray(item.emptyPages) || item.emptyPages.some((page, index) => !Number.isInteger(page) || page < 1 || page > item.pageCount || (index > 0 && page <= item.emptyPages[index - 1]!))
      || !item.chunks.length || item.chunks.length > 1000 || item.chunks.length !== item.vectors.length) throw new CorpusFailure('invalid_document');
    for (const [index, chunk] of item.chunks.entries()) {
      if (chunk.ordinal !== index + 1 || !Number.isInteger(chunk.page) || chunk.page < 1 || chunk.page > item.pageCount || item.emptyPages.includes(chunk.page)
        || typeof chunk.text !== 'string' || !chunk.text.trim() || Array.from(chunk.text).length > 1000 || Buffer.byteLength(chunk.text) > 1200) throw new CorpusFailure('invalid_document');
      const vector = item.vectors[index]!;
      normalizeVector(vector, identity.dimensions);
      if (Math.abs(Math.hypot(...vector) - 1) > 0.00001 || vector.some(part => Math.fround(part) !== part)) throw new CorpusFailure('invalid_document');
    }
  }
  const db = openKnowledge(directory);
  try {
    return db.transaction(() => {
      const known = db.prepare('SELECT identity FROM embedding_indexes WHERE index_key=?').get(bucket) as { identity: string } | undefined;
      if (known && indexKey(JSON.parse(known.identity) as IndexIdentity) !== bucket) throw new CorpusFailure('index_incompatible');
      if (!known) {
        const count = db.prepare('SELECT count(*) AS n FROM embedding_indexes').get() as { n: number };
        if (count.n >= corpusLimits.indexes) throw new CorpusFailure('corpus_limits');
        db.prepare('INSERT INTO embedding_indexes VALUES (?,?)').run(bucket, JSON.stringify(identity));
      }
      const results: DocumentVersion[] = [];
      for (const item of prepared) {
        const row = db.prepare('SELECT v.* FROM current_documents c JOIN document_versions v USING(document_key,version) WHERE document_key=?').get(item.key) as VersionRow | undefined;
        if ((row?.version ?? 0) !== item.expectedVersion) throw new CorpusFailure('version_conflict');
        const changed = !row || row.source_hash !== item.sourceHash || row.title !== item.title;
        const version = (row?.version ?? 0) + (changed ? 1 : 0);
        if (version > corpusLimits.versions) throw new CorpusFailure('corpus_limits');
        if (changed) {
          db.prepare('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?)').run(item.key, version, item.title, item.sourceHash, item.pageCount, JSON.stringify(item.emptyPages), new Date().toISOString(), 'pdfjs-6.5.438');
          db.prepare('INSERT INTO current_documents VALUES (?,?) ON CONFLICT(document_key) DO UPDATE SET version=excluded.version').run(item.key, version);
        } else if (row.page_count !== item.pageCount || row.empty_pages !== JSON.stringify(item.emptyPages)) throw new CorpusFailure('invalid_document');
        const membership = db.prepare('SELECT chunk_count FROM document_indexes WHERE index_key=? AND document_key=? AND version=?').get(bucket, item.key, version);
        if (!membership) {
          db.prepare('INSERT INTO document_indexes VALUES (?,?,?,?)').run(bucket, item.key, version, item.chunks.length);
          const insert = db.prepare('INSERT INTO document_chunks VALUES (?,?,?,?,?,?,?,?)');
          for (const [index, chunk] of item.chunks.entries()) {
            const vector = item.vectors[index]!;
            const data = Buffer.alloc(vector.length * 4); vector.forEach((value, offset) => data.writeFloatLE(value, offset * 4));
            const id = createHash('sha256').update(JSON.stringify([bucket, item.key, version, chunk.ordinal])).digest('hex');
            insert.run(bucket, item.key, version, chunk.ordinal, id, chunk.page, chunk.text, data);
          }
        }
        results.push(document(db.prepare('SELECT * FROM document_versions WHERE document_key=? AND version=?').get(item.key, version) as VersionRow));
      }
      const count = db.prepare('SELECT count(*) AS n FROM current_documents').get() as { n: number };
      const total = db.prepare('SELECT count(*) AS n FROM document_chunks').get() as { n: number };
      const active = db.prepare('SELECT count(*) AS n FROM document_chunks x JOIN current_documents c USING(document_key,version) WHERE index_key=?').get(bucket) as { n: number };
      if (count.n > corpusLimits.documents || total.n > corpusLimits.totalChunks || active.n > corpusLimits.currentChunks) throw new CorpusFailure('corpus_limits');
      return Object.freeze(results);
    }).immediate();
  } finally { db.close(); }
}
export function corpusStatus(directory: string, identity?: IndexIdentity) {
  const db = openKnowledge(directory);
  try {
    const documents = currentRows(db);
    const bucket = identity ? indexKey(validateIndex(identity)) : null;
    const indexed = bucket ? (db.prepare('SELECT count(*) AS n FROM document_indexes JOIN current_documents USING(document_key,version) WHERE index_key=?').get(bucket) as { n: number }).n : 0;
    const indexes = (db.prepare('SELECT count(*) AS n FROM embedding_indexes').get() as { n: number }).n;
    return Object.freeze({ documents: documents.length, indexedDocuments: indexed, indexes, complete: documents.length > 0 && indexed === documents.length, indexKey: bucket });
  } finally { db.close(); }
}
export function selectedIndex(directory: string, model: string, digest: string, settings: EmbeddingSettings): IndexIdentity | undefined {
  const db = openKnowledge(directory);
  try {
    const rows = db.prepare('SELECT identity FROM embedding_indexes LIMIT ?').all(corpusLimits.indexes + 1) as { identity: string }[];
    if (rows.length > corpusLimits.indexes) throw new CorpusFailure('corpus_limits');
    const matches = rows.map(row => validateIndex(JSON.parse(row.identity) as IndexIdentity)).filter(identity => identity.model === model && identity.digest === digest.toLowerCase()
      && identity.documentPrefix === settings.documentPrefix && identity.queryPrefix === settings.queryPrefix);
    if (matches.length > 1) throw new CorpusFailure('index_incompatible');
    return matches[0];
  } finally { db.close(); }
}
export function evidenceChunks(directory: string, identity: IndexIdentity): readonly EvidenceChunk[] {
  const db = openKnowledge(directory);
  try {
    return db.transaction(() => {
      const bucket = indexKey(validateIndex(identity));
      const missing = db.prepare('SELECT count(*) AS n FROM current_documents c LEFT JOIN document_indexes x ON c.document_key=x.document_key AND c.version=x.version AND x.index_key=? WHERE x.index_key IS NULL').get(bucket) as { n: number };
      if (missing.n) throw new CorpusFailure('index_incomplete');
      const rows = db.prepare('SELECT v.*,x.ordinal,x.chunk_id,x.page,x.text,x.vector FROM document_chunks x JOIN current_documents c USING(document_key,version) JOIN document_versions v USING(document_key,version) WHERE index_key=? ORDER BY document_key,ordinal LIMIT ?').all(bucket, corpusLimits.currentChunks + 1) as (VersionRow & { ordinal: number; chunk_id: string; page: number; text: string; vector: Buffer })[];
      if (!rows.length) throw new CorpusFailure('index_incomplete');
      if (rows.length > corpusLimits.currentChunks) throw new CorpusFailure('corpus_limits');
      return Object.freeze(rows.map(row => {
        if (row.vector.length !== identity.dimensions * 4) throw new CorpusFailure('index_incompatible');
        const vector = Array.from({ length: identity.dimensions }, (_, index) => row.vector.readFloatLE(index * 4));
        normalizeVector(vector, identity.dimensions);
        if (Math.abs(Math.hypot(...vector) - 1) > 0.00001) throw new CorpusFailure('index_incompatible');
        return Object.freeze({ chunkId: row.chunk_id, document: document(row), ordinal: row.ordinal, page: row.page, text: row.text, vector: Object.freeze(vector) });
      }));
    })();
  } finally { db.close(); }
}

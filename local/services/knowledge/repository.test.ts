import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrate, openKnowledge } from './database.ts';
import { chunkerVersion } from './chunks.ts';
import { corpusStatus, currentDocuments, evidenceChunks, publishDocuments, retireDocument, type PreparedDocument } from './repository.ts';

const identity = { model: 'synthetic:test', digest: 'a'.repeat(64), dimensions: 2, documentPrefix: '', queryPrefix: '', chunkerVersion };
const fixture = (overrides: Partial<PreparedDocument> = {}): PreparedDocument => ({ key: 'training', title: 'Synthetic training', sourceHash: 'b'.repeat(64), pageCount: 2, emptyPages: [2], expectedVersion: 0,
  chunks: [{ ordinal: 1, page: 1, text: 'Synthetic tools require training.' }], vectors: [[1, 0]], ...overrides });
it('retires active evidence without deleting history and never reuses an immutable retired version', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms011-retire-'));
  try {
    migrate(root); publishDocuments(root, identity, [fixture()]);
    expect(retireDocument(root, 'training')).toBe(true); expect(retireDocument(root, 'training')).toBe(false);
    expect(currentDocuments(root)).toEqual([]);
    const db = openKnowledge(root); expect(db.prepare('SELECT count(*) AS n FROM document_versions').get()).toEqual({ n: 1 }); db.close();
    expect(publishDocuments(root, identity, [fixture({ parserVersion: 'windows-ocr-en-us-v1' })])[0]).toMatchObject({ version: 2, parserVersion: 'windows-ocr-en-us-v1' });
  } finally { expect(path.dirname(root)).toBe(path.resolve(tmpdir())); expect(path.basename(root).startsWith('ms011-retire-')).toBe(true); rmSync(root, { recursive: true, force: true }); }
});
it('atomically publishes immutable versions and compatible chunks, replays duplicates and rejects stale writers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-index-'));
  try {
    migrate(root); expect(corpusStatus(root).complete).toBe(false);
    expect(() => evidenceChunks(root, identity)).toThrow('index_incomplete');
    const first = publishDocuments(root, identity, [fixture()])[0]!;
    expect(first).toMatchObject({ version: 1, pageCount: 2, emptyPages: [2], parserVersion: 'pdfjs-6.5.438' });
    expect(publishDocuments(root, identity, [fixture({ expectedVersion: 1 })])[0]).toEqual(first);
    const oldEvidence = evidenceChunks(root, identity);
    expect(oldEvidence[0]).toMatchObject({ document: first, page: 1 });
    expect(corpusStatus(root, identity)).toMatchObject({ documents: 1, indexedDocuments: 1, indexes: 1, complete: true });
    expect(() => publishDocuments(root, identity, [fixture({ title: 'Concurrent source' })])).toThrow('version_conflict');
    const updated = publishDocuments(root, identity, [fixture({ expectedVersion: 1, title: 'Updated synthetic training' })])[0]!;
    expect(updated.version).toBe(2); expect(evidenceChunks(root, identity)[0]!.chunkId).not.toBe(oldEvidence[0]!.chunkId);
    const db = openKnowledge(root);
    expect(db.prepare('SELECT count(*) AS n FROM document_versions').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT count(*) AS n FROM document_chunks').get()).toEqual({ n: 2 }); db.close();
    const other = { ...identity, digest: 'c'.repeat(64) };
    expect(corpusStatus(root, other).complete).toBe(false);
    expect(() => evidenceChunks(root, other)).toThrow('index_incomplete');
    publishDocuments(root, other, [fixture({ expectedVersion: 2, title: updated.title })]);
    expect(corpusStatus(root, other).complete).toBe(true);
    expect(currentDocuments(root)[0]!.version).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('refuses incomplete chunk sets and rejects a reindex snapshot missing a newly added document', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-incomplete-'));
  try {
    migrate(root); publishDocuments(root, identity, [fixture()]);
    publishDocuments(root, identity, [fixture({ key: 'hours' })]);
    expect(() => publishDocuments(root, { ...identity, digest: 'c'.repeat(64) }, [fixture({ expectedVersion: 1 })], true)).toThrow('version_conflict');
    expect(corpusStatus(root, identity).indexes).toBe(1);
    const db = openKnowledge(root); db.prepare('DELETE FROM document_chunks WHERE document_key=?').run('hours'); db.close();
    expect(corpusStatus(root, identity)).toMatchObject({ documents: 2, indexedDocuments: 1, complete: false });
    expect(() => evidenceChunks(root, identity)).toThrow('index_incomplete');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('rolls back an entire prepared corpus on conflict/quota and rejects invalid provenance/vectors', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-atomic-'));
  try {
    migrate(root); publishDocuments(root, identity, [fixture()]);
    expect(() => publishDocuments(root, identity, [fixture({ key: 'hours' }), fixture({ title: 'Stale writer' })])).toThrow('version_conflict');
    expect(currentDocuments(root).map(doc => doc.key)).toEqual(['training']);
    for (const overrides of [{ key: '../escape' }, { sourceHash: 'bad' }, { vectors: [[0, 0]] }, { vectors: [[1, 0, 0]] }, { emptyPages: [1, 2] }, { chunks: [{ ordinal: 1, page: 3, text: 'bad' }] }]) expect(() => publishDocuments(root, identity, [fixture(overrides)])).toThrow();
    for (let version = 1; version < 10; version++) publishDocuments(root, identity, [fixture({ expectedVersion: version, title: `Synthetic version ${version + 1}` })]);
    expect(() => publishDocuments(root, identity, [fixture({ expectedVersion: 10, title: 'Eleventh version' })])).toThrow('corpus_limits');
    expect(currentDocuments(root)[0]!.version).toBe(10);
    for (const letter of ['c', 'd', 'e']) publishDocuments(root, { ...identity, digest: letter.repeat(64) }, [fixture({ expectedVersion: 10, title: 'Synthetic version 10' })]);
    expect(() => publishDocuments(root, { ...identity, digest: 'f'.repeat(64) }, [fixture({ expectedVersion: 10, title: 'Synthetic version 10' })])).toThrow('corpus_limits');
    expect(corpusStatus(root, identity).complete).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { syntheticPdf } from '../../tests/pdf-fixture.ts';
import { migrate } from './database.ts';
import { ingestDocument, reindexDocuments } from './ingestion.ts';
import { defaultEmbeddingSettings } from './settings.ts';
import { currentDocuments, corpusStatus, evidenceChunks } from './repository.ts';
import { privateSourcePath } from './sources.ts';

it('requires explicit approval, preserves active evidence on failure, and reindexes only approved private sources atomically', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-import-'));
  let digest = 'a'.repeat(64), embeds = 0, failAt = Infinity;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest }] })); return; }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      embeds++;
      if (embeds >= failAt) { res.writeHead(500); res.end('{}'); return; }
      const data = JSON.parse(body);
      res.end(JSON.stringify({ model: 'synthetic:test', embeddings: data.input.map(() => [1, 0]) }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = { directory: path.join(root, 'private'), baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, settings: defaultEmbeddingSettings('synthetic:test') };
  const file = path.join(root, 'synthetic.pdf');
  const input = { approved: true, key: 'training', title: 'Synthetic training', file };
  try {
    writeFileSync(file, syntheticPdf(['Synthetic tools require training.', 'Synthetic desk closes at six.']));
    await expect(ingestDocument(context, { ...input, approved: false })).rejects.toThrow('approval_required');
    expect(embeds).toBe(0); expect(existsSync(context.directory)).toBe(false);
    migrate(context.directory);
    const first = await ingestDocument(context, input);
    expect(evidenceChunks(context.directory, first.identity).map(chunk => chunk.page)).toEqual([1, 2]);
    const repeated = await ingestDocument(context, input); expect(repeated.documents).toEqual(first.documents);
    failAt = embeds + 1; writeFileSync(file, syntheticPdf(['Changed synthetic policy.']));
    await expect(ingestDocument(context, input)).rejects.toMatchObject({ code: 'http_error' });
    expect(currentDocuments(context.directory)).toEqual(first.documents);
    expect(evidenceChunks(context.directory, first.identity)).toHaveLength(2);
    failAt = Infinity;
    await ingestDocument(context, { ...input, key: 'hours', title: 'Synthetic hours' });
    digest = 'b'.repeat(64);
    expect(corpusStatus(context.directory, { ...first.identity, digest }).complete).toBe(false);
    failAt = embeds + 2;
    await expect(reindexDocuments(context)).rejects.toMatchObject({ code: 'http_error' });
    expect(corpusStatus(context.directory, { ...first.identity, digest })).toMatchObject({ indexedDocuments: 0, indexes: 1, complete: false });
    failAt = Infinity;
    const rebuilt = await reindexDocuments(context);
    expect(corpusStatus(context.directory, rebuilt.identity)).toMatchObject({ indexedDocuments: 2, indexes: 2, complete: true });
    expect(rebuilt.documents.every(document => document.version === 1)).toBe(true);
    const abort = new AbortController(); abort.abort();
    await expect(ingestDocument({ ...context, signal: abort.signal }, input)).rejects.toMatchObject({ code: 'cancelled' });
    expect(currentDocuments(context.directory)).toEqual(rebuilt.documents);
    const selected = rebuilt.documents[0]!;
    writeFileSync(privateSourcePath(context.directory, selected.sourceHash), syntheticPdf(['Corrupt synthetic source.']));
    await expect(reindexDocuments(context)).rejects.toThrow('source_unavailable');
    expect(corpusStatus(context.directory, rebuilt.identity).complete).toBe(true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
it('prevents concurrently prepared imports from silently replacing one another', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-concurrent-'));
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] }));
    else { req.resume(); req.on('end', () => res.end(JSON.stringify({ model: 'synthetic:test', embeddings: [[1, 0]] }))); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const directory = path.join(root, 'private'); migrate(directory);
    const file = path.join(root, 'synthetic.pdf'); writeFileSync(file, syntheticPdf(['Synthetic concurrency policy.']));
    const context = { directory, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, settings: defaultEmbeddingSettings('synthetic:test') };
    const results = await Promise.allSettled([ingestDocument(context, { approved: true, key: 'policy', title: 'First synthetic', file }), ingestDocument(context, { approved: true, key: 'policy', title: 'Second synthetic', file })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'version_conflict' });
    expect(currentDocuments(directory)).toHaveLength(1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

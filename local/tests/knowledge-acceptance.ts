// Explicit synthetic acceptance probe. Never invoked by application startup or ordinary CI.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runtimeFixture } from './runtime-fixture.ts';
import { syntheticPdf } from './pdf-fixture.ts';
import { migrate } from '../services/knowledge/database.ts';
import { defaultEmbeddingSettings } from '../services/knowledge/settings.ts';
import { ingestDocument, reindexDocuments } from '../services/knowledge/ingestion.ts';
import { embedTexts } from '../services/knowledge/embeddings.ts';
import { corpusStatus, evidenceChunks } from '../services/knowledge/repository.ts';

if (process.argv.length !== 3 || process.argv[2] !== '--cpu') throw new Error('Explicit --cpu approval required for synthetic model verification.');
const fixture = await runtimeFixture();
const started = performance.now();
try {
  const directory = fixture.config.runtime.knowledge;
  migrate(directory);
  const file = path.join(fixture.root, 'synthetic-policy.pdf');
  writeFileSync(file, syntheticPdf(['Synthetic tools require staff training before use.', 'Synthetic workshop hours are nine to six. Contact the desk for current hours.']));
  const context = { directory, baseUrl: 'http://127.0.0.1:11434', settings: defaultEmbeddingSettings('embeddinggemma:latest') };
  const input = { approved: true, key: 'synthetic-policy', title: 'Synthetic policy fixture', file };
  const imported = await ingestDocument(context, input);
  assert.equal(imported.identity.dimensions, 768);
  assert.equal(corpusStatus(directory, imported.identity).complete, true);
  assert.deepEqual((await ingestDocument(context, input)).documents, imported.documents);
  const evidence = evidenceChunks(directory, imported.identity);
  assert.deepEqual(evidence.map(chunk => chunk.page), [1, 2]);
  const query = await embedTexts(context.baseUrl, context.settings, ['What training is required before using tools?'], { kind: 'query', expected: imported.identity });
  const ranked = evidence.map(chunk => ({ page: chunk.page, score: chunk.vector.reduce((sum, part, index) => sum + part * query.vectors[0]![index]!, 0) })).sort((a, b) => b.score - a.score);
  assert.equal(ranked[0]!.page, 1);
  assert.ok(ranked[0]!.score > ranked[1]!.score);
  assert.deepEqual((await reindexDocuments(context)).documents, imported.documents);
  console.log(JSON.stringify({ ok: true, model: imported.identity.model, digest: imported.identity.digest, dimensions: imported.identity.dimensions,
    documents: 1, pages: 2, chunks: evidence.length, duplicatePreserved: true, reindexPreserved: true, syntheticLookupPage: ranked[0]!.page,
    durationMs: Math.round(performance.now() - started) }));
} finally { fixture.dispose(); }

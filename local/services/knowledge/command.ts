import { loadConfiguration } from '../../packages/config/index.mjs';
import { configureEmbeddings, loadEmbeddingSettings } from './settings.ts';
import { inspectModel } from './ollama.ts';
import { ingestDocument, reindexDocuments } from './ingestion.ts';
import { corpusStatus, selectedIndex } from './repository.ts';
import { EmbeddingFailure } from './embeddings.ts';

export function parseKnowledgeArguments(args: readonly string[]) {
  const command = args[0];
  if (!command || !['configure', 'ingest', 'reindex', 'status'].includes(command)) throw new Error('usage');
  const allowed = command === 'configure' ? ['model'] : command === 'ingest' ? ['approved', 'key', 'title', 'file'] : [];
  const values: Record<string, string | boolean> = {};
  for (let index = 1; index < args.length; index++) {
    const key = args[index]?.slice(2);
    if (!args[index]?.startsWith('--') || !key || !allowed.includes(key) || key in values) throw new Error('usage');
    if (key === 'approved') values[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('usage');
      values[key] = value;
    }
  }
  if (command === 'configure' && typeof values.model !== 'string') throw new Error('usage');
  if (command === 'ingest' && ['key', 'title', 'file'].some(key => typeof values[key] !== 'string')) throw new Error('usage');
  return { command, values };
}
export async function runKnowledgeCommand(args = process.argv.slice(2)) {
  const { command, values } = parseKnowledgeArguments(args);
  const config = loadConfiguration();
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const directory = config.runtime.knowledge;
    if (command === 'configure') {
      const model = values.model as string;
      const inspection = await inspectModel({ baseUrl: config.urls.ollama, model }, { signal: controller.signal });
      if (inspection.code !== 'ready') throw new EmbeddingFailure(inspection.code);
      configureEmbeddings(directory, model);
      console.log(JSON.stringify({ ok: true, code: 'configured', model: inspection.model, digest: inspection.digest })); return;
    }
    const settings = loadEmbeddingSettings(directory);
    if (command === 'status') {
      const inspection = await inspectModel({ baseUrl: config.urls.ollama, model: settings.model }, { signal: controller.signal });
      const identity = inspection.code === 'ready' && inspection.model && inspection.digest ? selectedIndex(directory, inspection.model, inspection.digest, settings) : undefined;
      console.log(JSON.stringify({ ok: true, code: inspection.code, ...corpusStatus(directory, identity), ...(identity ? { identity } : {}) })); return;
    }
    const context = { directory, baseUrl: config.urls.ollama, settings, signal: controller.signal };
    const result = command === 'ingest' ? await ingestDocument(context, { approved: values.approved === true, key: values.key as string, title: values.title as string, file: values.file as string }) : await reindexDocuments(context);
    console.log(JSON.stringify({ ok: true, code: 'indexed', identity: result.identity, versions: result.documents.map(document => ({ key: document.key, version: document.version, sourceHash: document.sourceHash, pageCount: document.pageCount, emptyPages: document.emptyPages })), ...corpusStatus(directory, result.identity) }));
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
if (import.meta.main) {
  try { await runKnowledgeCommand(); }
  catch (error) {
    const value = error instanceof Error ? error.message : '';
    const code = ['usage', 'approval_required', 'source_unavailable', 'invalid_document', 'version_conflict', 'corpus_limits', 'index_incomplete', 'index_incompatible', 'model_not_configured', 'model_missing', 'cloud_model_rejected', 'model_changed', 'invalid_vector', 'invalid_response', 'runtime_unavailable', 'http_error', 'timeout', 'cancelled', 'invalid_pdf', 'parse_failed', 'pdf_limits', 'no_text', 'password_required'].includes(value) ? value : 'ingestion_unavailable';
    console.error(JSON.stringify({ ok: false, code })); process.exitCode = 1;
  }
}

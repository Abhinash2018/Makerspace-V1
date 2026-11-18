import { extractPdf } from './pdf.ts';
import { extractOcr } from './ocr.ts';
import { chunkPages } from './chunks.ts';
import { embedTexts, EmbeddingFailure, type IndexIdentity } from './embeddings.ts';
import type { EmbeddingSettings } from './settings.ts';
import { currentDocuments, publishDocuments, validateDocumentMetadata, CorpusFailure, type PreparedDocument } from './repository.ts';
import { preparePrivateSource, privateSourcePath, readPdfSource, sourceHash } from './sources.ts';

type Context = { directory: string; baseUrl: string; settings: EmbeddingSettings; signal?: AbortSignal };
function cancellation(signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(300000);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
function check(signal: AbortSignal) { if (signal.aborted) throw new EmbeddingFailure('cancelled'); }
async function prepare(context: Context, metadata: { key: string; title: string; expectedVersion: number; parserVersion?: NonNullable<PreparedDocument['parserVersion']> }, bytes: Uint8Array, signal: AbortSignal, expected?: IndexIdentity) {
  check(signal);
  if (metadata.parserVersion === 'windows-ocr-en-us-v1') preparePrivateSource(context.directory, bytes);
  const extracted = metadata.parserVersion === 'windows-ocr-en-us-v1'
    ? await extractOcr(privateSourcePath(context.directory, sourceHash(bytes)), signal) : await extractPdf(bytes, { signal });
  const chunks = chunkPages(extracted.pages);
  const vectors: (readonly number[])[] = [];
  let identity = expected;
  for (let offset = 0; offset < chunks.length; offset += 8) {
    check(signal);
    const batch = await embedTexts(context.baseUrl, context.settings, chunks.slice(offset, offset + 8).map(chunk => chunk.text), { signal, ...(identity ? { expected: identity } : {}) });
    identity = batch.identity; vectors.push(...batch.vectors);
  }
  if (!identity) throw new EmbeddingFailure('invalid_response');
  const document: PreparedDocument = { ...metadata, sourceHash: sourceHash(bytes), pageCount: extracted.pageCount, emptyPages: extracted.emptyPages, chunks, vectors };
  return { identity, document };
}
export async function ingestDocument(context: Context, input: { approved: boolean; key: string; title: string; file: string; ocr?: boolean }) {
  if (input.approved !== true) throw new Error('approval_required');
  validateDocumentMetadata(input);
  const documents = currentDocuments(context.directory);
  const previous = documents.find(document => document.key === input.key);
  const signal = cancellation(context.signal);
  check(signal);
  const bytes = readPdfSource(input.file);
  const result = await prepare(context, { key: input.key, title: input.title, expectedVersion: previous?.version ?? 0,
    parserVersion: input.ocr ? 'windows-ocr-en-us-v1' : 'pdfjs-6.5.438' }, bytes, signal);
  check(signal); preparePrivateSource(context.directory, bytes); check(signal);
  const published = publishDocuments(context.directory, result.identity, [result.document]);
  return { identity: result.identity, documents: published };
}
export async function reindexDocuments(context: Context) {
  const documents = currentDocuments(context.directory);
  if (!documents.length) throw new CorpusFailure('index_incomplete');
  const signal = cancellation(context.signal);
  const prepared: PreparedDocument[] = [];
  let identity: IndexIdentity | undefined;
  for (const document of documents) {
    check(signal);
    const bytes = readPdfSource(privateSourcePath(context.directory, document.sourceHash));
    if (sourceHash(bytes) !== document.sourceHash) throw new Error('source_unavailable');
    const result = await prepare(context, { key: document.key, title: document.title, expectedVersion: document.version,
      parserVersion: document.parserVersion === 'windows-ocr-en-us-v1' ? 'windows-ocr-en-us-v1' : 'pdfjs-6.5.438' }, bytes, signal, identity);
    identity = result.identity; prepared.push(result.document);
  }
  check(signal);
  if (!identity) throw new CorpusFailure('index_incomplete');
  return { identity, documents: publishDocuments(context.directory, identity, prepared, true) };
}

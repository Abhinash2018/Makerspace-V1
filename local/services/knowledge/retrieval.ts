import { inspectModel } from './ollama.ts';
import { embedTexts, EmbeddingFailure, type IndexIdentity } from './embeddings.ts';
import type { EmbeddingSettings } from './settings.ts';
import { selectedIndex, corpusStatus, evidenceChunks, CorpusFailure, type EvidenceChunk } from './repository.ts';

const ignored = new Set('a an and are as at be before can do does for from how i in is it me my of on or the this to use using what when where which who with you your synthetic'.split(' '));
export function questionTerms(question: string): readonly string[] {
  return Array.from(new Set(question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])).filter(word => word.length > 2 && !ignored.has(word));
}
export function overlaps(question: string, text: string): boolean {
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return questionTerms(question).some(word => words.has(word));
}
export function rankEvidence(question: string, vector: readonly number[], chunks: readonly EvidenceChunk[]): readonly EvidenceChunk[] {
  return Object.freeze(chunks.map(chunk => ({ chunk, score: chunk.vector.length === vector.length ? chunk.vector.reduce((sum, part, index) => sum + part * vector[index]!, 0) : -1 }))
    .filter(item => Number.isFinite(item.score) && item.score >= 0.35 && overlaps(question, item.chunk.text))
    .sort((left, right) => right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId)).slice(0, 4).map(item => item.chunk));
}
export async function retrieveEvidence(context: { directory: string; baseUrl: string; settings: EmbeddingSettings }, question: string, signal: AbortSignal): Promise<{ identity: IndexIdentity; evidence: readonly EvidenceChunk[] }> {
  const model = await inspectModel({ baseUrl: context.baseUrl, model: context.settings.model }, { signal });
  if (model.code !== 'ready' || !model.model || !model.digest) throw new EmbeddingFailure(model.code);
  const identity = selectedIndex(context.directory, model.model, model.digest, context.settings);
  if (!identity || !corpusStatus(context.directory, identity).complete) throw new CorpusFailure('index_incomplete');
  const chunks = evidenceChunks(context.directory, identity);
  const query = await embedTexts(context.baseUrl, context.settings, [question], { kind: 'query', expected: identity, signal });
  return { identity, evidence: rankEvidence(question, query.vectors[0]!, chunks) };
}

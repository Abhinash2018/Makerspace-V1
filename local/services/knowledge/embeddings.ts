import { createHash } from 'node:crypto';
import { boundedJson, HttpFailure } from '../../packages/http/client.ts';
import { inspectModel } from './ollama.ts';
import { chunkerVersion } from './chunks.ts';
import { parseEmbeddingSettings, type EmbeddingSettings } from './settings.ts';

export type IndexIdentity = Readonly<{ model: string; digest: string; dimensions: number; documentPrefix: string; queryPrefix: string; chunkerVersion: string }>;
export class EmbeddingFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function indexKey(identity: IndexIdentity): string {
  return createHash('sha256').update(JSON.stringify([identity.model, identity.digest, identity.dimensions, identity.documentPrefix, identity.queryPrefix, identity.chunkerVersion])).digest('hex');
}
export function normalizeVector(value: unknown, dimensions?: number): readonly number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4096 || (dimensions !== undefined && value.length !== dimensions)
    || value.some(part => typeof part !== 'number' || !Number.isFinite(part) || Math.abs(part) > 1e10)) throw new EmbeddingFailure('invalid_vector');
  const norm = Math.hypot(...value as number[]);
  if (!Number.isFinite(norm) || norm < 1e-20) throw new EmbeddingFailure('invalid_vector');
  return Object.freeze((value as number[]).map(part => Math.fround(part / norm)));
}
export async function embedTexts(baseUrl: string, settingsInput: EmbeddingSettings, texts: readonly string[], options: {
  signal?: AbortSignal; timeoutMs?: number; kind?: 'document' | 'query'; expected?: IndexIdentity;
} = {}): Promise<{ identity: IndexIdentity; vectors: readonly (readonly number[])[] }> {
  const settings = parseEmbeddingSettings(settingsInput);
  if (!settings.model) throw new EmbeddingFailure('model_not_configured');
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 8 || texts.some(text => typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 1400)) throw new EmbeddingFailure('input_limits');
  if (options.signal?.aborted) throw new EmbeddingFailure('cancelled');
  const timeout = Math.min(120000, Math.max(1, options.timeoutMs ?? 120000));
  if (!Number.isFinite(timeout)) throw new EmbeddingFailure('input_limits');
  try {
    const cancellation = options.signal ? { signal: options.signal } : {};
    const inspectOptions = { ...cancellation, timeoutMs: Math.min(2000, timeout) };
    const before = await inspectModel({ baseUrl, model: settings.model }, inspectOptions);
    if (before.code !== 'ready' || !before.model || !before.digest) throw new EmbeddingFailure(before.code);
    const response = await boundedJson(`${baseUrl}/api/embed`, { ...cancellation, timeoutMs: timeout, maxBytes: 1024 * 1024,
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: before.model,
        input: texts.map(text => (options.kind === 'query' ? settings.queryPrefix : settings.documentPrefix) + text),
        truncate: false, keep_alive: '1m', options: { num_ctx: 2048, ...(settings.cpuOnly ? { num_gpu: 0 } : {}) },
      }),
    }) as { model?: unknown; embeddings?: unknown } | null;
    if (response?.model !== before.model || !Array.isArray(response.embeddings) || response.embeddings.length !== texts.length) throw new EmbeddingFailure('invalid_response');
    const vectors = response.embeddings.map(value => normalizeVector(value));
    const dimensions = vectors[0]!.length;
    if (vectors.some(vector => vector.length !== dimensions)) throw new EmbeddingFailure('invalid_vector');
    const identity = Object.freeze({ model: before.model, digest: before.digest.toLowerCase(), dimensions,
      documentPrefix: settings.documentPrefix, queryPrefix: settings.queryPrefix, chunkerVersion });
    if (options.expected && indexKey(options.expected) !== indexKey(identity)) throw new EmbeddingFailure('index_incompatible');
    const after = await inspectModel({ baseUrl, model: before.model }, inspectOptions);
    if (after.code !== 'ready' || after.model !== before.model || after.digest?.toLowerCase() !== identity.digest) throw new EmbeddingFailure('model_changed');
    return { identity, vectors: Object.freeze(vectors) };
  } catch (error) {
    if (options.signal?.aborted) throw new EmbeddingFailure('cancelled');
    if (error instanceof EmbeddingFailure) throw error;
    throw new EmbeddingFailure(error instanceof HttpFailure ? error.code : 'invalid_response');
  }
}

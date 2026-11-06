import type { ModelCode } from '../../packages/contracts/index.ts';
import { boundedJson, HttpFailure } from '../../packages/http/client.ts';

type Settings = { baseUrl: string; model: string | null };
type Options = { signal?: AbortSignal; timeoutMs?: number };
type Inspection = { runtimeAvailable: boolean | null; modelAvailable: boolean; code: ModelCode; model?: string; digest?: string };
function validate(settings: Settings) {
  if (!/^http:\/\/127\.0\.0\.1(?::[1-9][0-9]{0,4})?$/.test(settings.baseUrl)) throw new HttpFailure('runtime_unavailable');
  if (settings.model && (settings.model.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(settings.model))) throw new HttpFailure('invalid_response');
}
function code(error: unknown): ModelCode { return error instanceof HttpFailure ? error.code : 'invalid_response'; }

export async function inspectModel(settings: Settings, options: Options = {}): Promise<Inspection> {
  if (!settings.model) return { runtimeAvailable: null, modelAvailable: false, code: 'model_not_configured' };
  if (/(?:^|[-:])cloud$/i.test(settings.model)) return { runtimeAvailable: null, modelAvailable: false, code: 'cloud_model_rejected' };
  try {
    validate(settings);
    const data = await boundedJson(`${settings.baseUrl}/api/tags`, { ...options, maxBytes: 262144 });
    const models = (data as { models?: unknown } | null)?.models;
    if (!Array.isArray(models) || models.length > 1000) throw new HttpFailure('invalid_response');
    const match = models.find((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const name = (entry as { name?: unknown }).name;
      return name === settings.model || (!settings.model?.includes(':') && name === `${settings.model}:latest`);
    }) as { name?: unknown; digest?: unknown; remote_model?: unknown; remote_host?: unknown; remote?: unknown } | undefined;
    if (!match) return { runtimeAvailable: true, modelAvailable: false, code: 'model_missing' };
    if (match.remote_model || match.remote_host || match.remote) return { runtimeAvailable: true, modelAvailable: false, code: 'cloud_model_rejected' };
    if (typeof match.name !== 'string' || typeof match.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(match.digest)) throw new HttpFailure('invalid_response');
    return { runtimeAvailable: true, modelAvailable: true, code: 'ready', model: match.name, digest: match.digest };
  } catch (error) { return { runtimeAvailable: false, modelAvailable: false, code: code(error) }; }
}

export async function probeModel(settings: Settings, options: Options & { cpuOnly?: boolean } = {}) {
  const info = await inspectModel(settings, { ...options, timeoutMs: Math.min(options.timeoutMs ?? 2000, 2000) });
  if (info.code !== 'ready' || !info.model || !info.digest) return { ok: false, code: info.code };
  const started = performance.now();
  try {
    const result = await boundedJson(`${settings.baseUrl}/api/chat`, {
      ...options, timeoutMs: options.timeoutMs ?? 120000, maxBytes: 16384, method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: info.model, stream: false, think: false, messages: [{ role: 'user', content: 'Reply with OK.' }], options: { num_predict: 8, temperature: 0, num_ctx: 4096, ...(options.cpuOnly ? { num_gpu: 0 } : {}) } }),
    }) as { done?: unknown; model?: unknown; message?: { role?: unknown; content?: unknown } } | null;
    if (result?.done !== true || result.model !== info.model || result.message?.role !== 'assistant'
      || typeof result.message.content !== 'string' || !result.message.content.trim() || result.message.content.length > 256) throw new HttpFailure('invalid_response');
    // Deliberately omit generated content, prompt and response bodies.
    return { ok: true, code: 'ready', model: info.model, digest: info.digest, execution: options.cpuOnly ? 'cpu' : 'automatic', durationMs: Math.round(performance.now() - started) };
  } catch (error) { return { ok: false, code: code(error) }; }
}

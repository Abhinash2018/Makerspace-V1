export class HttpFailure extends Error {
  code: 'timeout' | 'cancelled' | 'redirect_rejected' | 'response_too_large' | 'invalid_response' | 'http_error' | 'runtime_unavailable';
  constructor(code: HttpFailure['code']) { super(code); this.code = code; }
}
export type BoundedOptions = {
  timeoutMs?: number; maxBytes?: number; signal?: AbortSignal; headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'DELETE'; body?: string;
};
export async function boundedResponse(url: string, options: BoundedOptions & { acceptStatuses?: readonly number[] } = {}): Promise<{ statusCode: number; body: unknown }> {
  // Internal callers construct fixed paths from validated configuration only.
  const destination = new URL(url);
  if (destination.protocol !== 'http:' || destination.hostname !== '127.0.0.1' || destination.username || destination.password) throw new HttpFailure('runtime_unavailable');
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 2000);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  const limit = options.maxBytes ?? 65536;
  try {
    const response = await fetch(destination, {
      method: options.method ?? 'GET', headers: options.headers ?? {}, redirect: 'manual', signal,
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new HttpFailure('redirect_rejected'); }
    if (!response.ok && !options.acceptStatuses?.includes(response.status)) { await response.body?.cancel(); throw new HttpFailure('http_error'); }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) { await response.body?.cancel(); throw new HttpFailure('invalid_response'); }
    const length = Number(response.headers.get('content-length'));
    if (length > limit) { await response.body?.cancel(); throw new HttpFailure('response_too_large'); }
    if (!response.body) throw new HttpFailure('invalid_response');
    const reader = response.body.getReader();
    let size = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new HttpFailure('response_too_large'); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    try { return { statusCode: response.status, body: JSON.parse(Buffer.concat(parts).toString('utf8')) }; }
    catch { throw new HttpFailure('invalid_response'); }
  } catch (error) {
    if (options.signal?.aborted) throw new HttpFailure('cancelled');
    if (deadline.aborted) throw new HttpFailure('timeout');
    if (error instanceof HttpFailure) throw error;
    throw new HttpFailure('runtime_unavailable');
  }
}
export async function boundedJson(url: string, options: BoundedOptions = {}): Promise<unknown> {
  return (await boundedResponse(url, options)).body;
}

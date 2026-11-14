import { performance } from 'node:perf_hooks';

// One fixed-size bucket per operation, never keyed by untrusted headers/IPs.
export function createLimit(maximum: number, windowMs: number, now = () => performance.now()) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Invalid limit.');
  let starts = now(), count = 0;
  return () => {
    const at = now();
    if (at - starts >= windowMs) { starts = at; count = 0; }
    if (count >= maximum) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (at - starts)) / 1000)) };
    count++;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

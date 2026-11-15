import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { selectQuotes } from './chat.ts';

it('uses bounded CPU structured local chat and refuses changed/remote/redirect/oversized/unfinished/tool replies', async () => {
  let mode = 'ready', calls = 0;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') {
      calls++; res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: (mode === 'changed' && calls > 1 ? 'b' : 'a').repeat(64), ...(mode === 'remote' ? { remote: true } : {}) }] })); return;
    }
    if (mode === 'redirect') { res.writeHead(302, { location: 'https://remote.invalid' }); res.end(); return; }
    if (mode === 'huge') { res.end('x'.repeat(16385)); return; }
    if (mode === 'slow') { res.write('{'); return; }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => {
      const input = JSON.parse(body);
      expect(input).toMatchObject({ stream: false, think: false, options: { num_gpu: 0, num_ctx: 4096, num_predict: 512, temperature: 0 } });
      expect(input.format).toMatchObject({ type: 'object' }); expect(input.tools).toBeUndefined();
      expect(input.messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user']);
      expect(JSON.parse(input.messages[1].content)).toEqual({ question: 'Training?', sources: [{ source: 'S1', text: 'Synthetic training is required.' }] });
      res.end(JSON.stringify({ model: mode === 'wrong' ? 'other' : 'synthetic:test', done: true, done_reason: mode === 'truncated' ? 'length' : 'stop',
        message: { role: 'assistant', content: mode === 'invalid' ? '{malformed' : JSON.stringify({ quotes: [{ source: 'S1', text: 'Synthetic training is required.' }] }), ...(mode === 'tools' ? { tool_calls: [{ function: 'execute' }] } : {}) },
      }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: 'synthetic:test' };
  const sources = [{ text: 'Synthetic training is required.' }];
  try {
    expect((await selectQuotes(context, 'Training?', sources, new AbortController().signal)).selection.success).toBe(true);
    mode = 'invalid'; expect((await selectQuotes(context, 'Training?', sources, new AbortController().signal)).selection.success).toBe(false);
    for (const next of ['changed', 'remote', 'redirect', 'huge', 'wrong', 'truncated', 'tools']) {
      mode = next; calls = 0; await expect(selectQuotes(context, 'Training?', sources, new AbortController().signal)).rejects.toThrow();
    }
    mode = 'slow'; await expect(selectQuotes(context, 'Training?', sources, AbortSignal.timeout(40))).rejects.toThrow();
    const cancelled = new AbortController(); cancelled.abort(); await expect(selectQuotes(context, 'Training?', sources, cancelled.signal)).rejects.toThrow();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

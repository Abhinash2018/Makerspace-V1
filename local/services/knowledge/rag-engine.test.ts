import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrate } from './database.ts';
import { configureEmbeddings } from './settings.ts';
import { publishDocuments, retireDocument } from './repository.ts';
import { chunkerVersion } from './chunks.ts';
import { createChatEngine } from './rag.ts';

it('grounds conversation in current sources, refuses bad model output and releases cancelled capacity', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ms011-engine-'));
  let mode = 'ready', chats = 0, started: (() => void) | undefined;
  const text = 'Synthetic tools require staff training before use.';
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic-embed:test', digest: (mode === 'changed' ? 'c' : 'a').repeat(64) }, { name: 'synthetic-chat:test', digest: 'b'.repeat(64) }] })); return; }
    let body = ''; req.on('data', part => { body += String(part); });
    req.on('end', () => {
      const input = JSON.parse(body);
      if (req.url === '/api/embed') { res.end(JSON.stringify({ model: 'synthetic-embed:test', embeddings: [mode === 'irrelevant' ? [0, 1] : [1, 0]] })); return; }
      chats++;
      expect(input).toMatchObject({ stream: false, think: false, options: { num_gpu: 0, num_ctx: 6144, num_predict: 400, temperature: 0 } });
      expect(input.tools).toBeUndefined(); expect(input.format.type).toBe('object');
      const data = JSON.parse(input.messages[1].content);
      expect(data.history).toEqual([{ role: 'user', content: 'How can I use tools?' }]);
      expect(data.sources[0]).toMatchObject({ source: 'S1', text }); expect(data.sources[0].page).toBeUndefined();
      if (mode === 'waiting') { started?.(); return; }
      if (mode === 'retired') retireDocument(directory, 'policy');
      const output = mode === 'invalid' ? '{bad' : JSON.stringify({ answer: mode === 'unsupported' ? '' : 'Start by completing staff training.', sources: mode === 'unsupported' ? [] : [mode === 'injected' ? 'S3' : 'S1'], ...(mode === 'forged' ? { quote: 'Made up.' } : {}) });
      res.end(JSON.stringify({ model: mode === 'wrong' ? 'other' : 'synthetic-chat:test', done: true, done_reason: mode === 'truncated' ? 'length' : 'stop',
        message: { role: 'assistant', content: output, ...(mode === 'tools' ? { tool_calls: [] } : {}) } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    migrate(directory); configureEmbeddings(directory, 'synthetic-embed:test');
    const chat = createChatEngine({ directory, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: 'synthetic-chat:test' });
    const input = { question: 'Which training?', history: [{ role: 'user', content: 'How can I use tools?' }, { role: 'assistant', content: 'Untrusted history.' }] };
    expect(await chat(input)).toMatchObject({ status: 'uncertain', reason: 'index_unavailable' }); expect(chats).toBe(0);
    publishDocuments(directory, { model: 'synthetic-embed:test', digest: 'a'.repeat(64), dimensions: 2, documentPrefix: '', queryPrefix: '', chunkerVersion }, [{ key: 'policy', title: 'Synthetic policy', sourceHash: 'd'.repeat(64), pageCount: 1, emptyPages: [], expectedVersion: 0, chunks: [{ ordinal: 1, page: 1, text }], vectors: [[1, 0]] }]);
    expect(await chat(input)).toMatchObject({ status: 'answered', sections: [{ sources: [{ quote: text, citation: { documentKey: 'policy', version: 1, page: 1 } }] }] });
    mode = 'irrelevant'; expect(await chat(input)).toMatchObject({ status: 'uncertain', reason: 'no_evidence' }); expect(chats).toBe(1);
    for (mode of ['injected', 'forged', 'invalid', 'unsupported']) expect((await chat(input)).status).toBe('uncertain');
    for (mode of ['wrong', 'truncated', 'tools']) await expect(chat(input)).rejects.toThrow('knowledge_unavailable');
    mode = 'changed'; expect(await chat(input)).toMatchObject({ status: 'uncertain', reason: 'index_unavailable' });
    mode = 'waiting'; const controller = new AbortController(), waiting = new Promise<void>(resolve => { started = resolve; });
    const pending = chat(input, controller.signal); await waiting; await expect(chat(input)).rejects.toThrow('busy');
    controller.abort(); await expect(pending).rejects.toThrow('knowledge_unavailable');
    mode = 'ready'; expect((await chat(input)).status).toBe('answered');
    mode = 'retired'; expect(await chat(input)).toMatchObject({ status: 'uncertain', reason: 'index_unavailable' });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    expect(path.dirname(directory)).toBe(path.resolve(tmpdir())); expect(path.basename(directory).startsWith('ms011-engine-')).toBe(true);
    rmSync(directory, { recursive: true, force: true });
  }
});

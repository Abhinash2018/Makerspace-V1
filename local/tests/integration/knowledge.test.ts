import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runtimeFixture } from '../runtime-fixture.ts';
import { syntheticPdf } from '../pdf-fixture.ts';
import { migrateAll } from '../../scripts/migrate.ts';

it('runs native operator configure/import/status/reindex commands without publishing paths, document bodies or credentials', async () => {
  const fixture = await runtimeFixture();
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:test', digest: 'a'.repeat(64) }] })); return; }
    let body = ''; req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => { const input = JSON.parse(body); res.end(JSON.stringify({ model: 'synthetic:test', embeddings: input.input.map(() => [1, 0]) })); });
  });
  await new Promise<void>(resolve => server.listen(Number(new URL(fixture.config.urls.ollama).port), '127.0.0.1', resolve));
  const command = async (args: string[], expectedCode = 0) => {
    const child = spawn(process.execPath, ['services/knowledge/command.ts', ...args], { cwd: fixture.root, env: fixture.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += String(chunk); }); child.stderr.on('data', chunk => { output += String(chunk); });
    const exit = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic operator command timed out')); }, 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    expect(exit).toBe(expectedCode);
    expect(output).not.toContain(fixture.root); expect(output).not.toContain(fixture.config.serviceToken);
    expect(output).not.toContain('Synthetic confidential fixture body');
    return JSON.parse(output);
  };
  try {
    migrateAll(fixture.root, fixture.env);
    const file = path.join(fixture.root, 'synthetic-policy.pdf'); writeFileSync(file, syntheticPdf(['Synthetic confidential fixture body: training required.', 'Synthetic desk closes at six.']));
    expect(await command(['status'])).toMatchObject({ code: 'model_not_configured', documents: 0, complete: false });
    expect(await command(['configure', '--model', 'synthetic:test'])).toMatchObject({ ok: true, code: 'configured' });
    expect(await command(['configure', '--model', 'synthetic:test'], 1)).toEqual({ ok: false, code: 'ingestion_unavailable' });
    const args = ['ingest', '--key', 'policy', '--title', 'Synthetic policy', '--file', file];
    expect(await command(args, 1)).toEqual({ ok: false, code: 'approval_required' });
    const first = await command([...args, '--approved']);
    expect(first).toMatchObject({ code: 'indexed', documents: 1, complete: true, versions: [{ key: 'policy', version: 1, pageCount: 2 }] });
    expect((await command([...args, '--approved'])).versions).toEqual(first.versions);
    expect(await command(['status'])).toMatchObject({ documents: 1, indexedDocuments: 1, complete: true });
    expect(await command(['reindex'])).toMatchObject({ code: 'indexed', complete: true });
    writeFileSync(file, '%PDF-1.7 synthetic-invalid');
    expect(await command([...args, '--approved'], 1)).toEqual({ ok: false, code: 'parse_failed' });
    expect(await command(['status'])).toMatchObject({ documents: 1, complete: true });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fixture.dispose(); }
}, 60000);

import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { configureEmbeddings, defaultEmbeddingSettings, EmbeddingSettingsError, loadEmbeddingSettings, parseEmbeddingSettings } from './settings.ts';

it('keeps knowledge settings private, model-specific and exclusive without changing common env', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-settings-'));
  try {
    expect(loadEmbeddingSettings(root)).toEqual({ version: 1, model: null, cpuOnly: true, documentPrefix: '', queryPrefix: '' });
    const directory = path.join(root, 'knowledge');
    configureEmbeddings(directory, 'embeddinggemma:latest');
    const settings = loadEmbeddingSettings(directory);
    expect(settings).toMatchObject({ model: 'embeddinggemma:latest', cpuOnly: true, documentPrefix: 'title: none | text: ', queryPrefix: 'task: search result | query: ' });
    expect(Object.isFrozen(settings)).toBe(true);
    const before = readFileSync(path.join(directory, 'embedding-settings.json'), 'utf8');
    expect(() => configureEmbeddings(directory, 'nomic-embed-text:v1.5')).toThrow(EmbeddingSettingsError);
    expect(readFileSync(path.join(directory, 'embedding-settings.json'), 'utf8')).toBe(before);
    expect(defaultEmbeddingSettings('nomic-embed-text:v1.5').queryPrefix).toBe('search_query: ');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('rejects remote/invalid models, unsupported keys, unbounded prefixes and malformed/symlinked storage', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-settings-invalid-'));
  try {
    const settings = defaultEmbeddingSettings('embeddinggemma:latest');
    for (const model of ['', 'https://remote.invalid/model', 'model:cloud', 'model-cloud', 'x'.repeat(201), 42]) expect(() => parseEmbeddingSettings({ ...settings, model })).toThrow(EmbeddingSettingsError);
    for (const change of [{ version: 2 }, { cpuOnly: 'true' }, { dimensions: 256 }, { baseUrl: 'https://remote.invalid' }, { queryPrefix: 'x'.repeat(129) }, { documentPrefix: 'bad\ninput' }]) expect(() => parseEmbeddingSettings({ ...settings, ...change })).toThrow(EmbeddingSettingsError);
    for (const source of ['{', 'null', '{}', 'x'.repeat(4097)]) { writeFileSync(path.join(root, 'embedding-settings.json'), source); expect(() => loadEmbeddingSettings(root)).toThrow(EmbeddingSettingsError); }
    const external = path.join(root, 'external'); mkdirSync(external);
    const linked = path.join(root, 'linked'); symlinkSync(external, linked, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => loadEmbeddingSettings(linked)).toThrow(EmbeddingSettingsError);
    expect(() => configureEmbeddings(linked, 'embeddinggemma:latest')).toThrow(EmbeddingSettingsError);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

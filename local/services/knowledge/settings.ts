import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkRuntimePath } from '../../packages/config/index.mjs';

export type EmbeddingSettings = Readonly<{ version: 1; model: string | null; cpuOnly: boolean; documentPrefix: string; queryPrefix: string }>;
export class EmbeddingSettingsError extends Error {
  constructor() { super('Embedding settings unavailable; check the private settings file and configuration command.'); }
}
export function defaultEmbeddingSettings(model: string | null = null): EmbeddingSettings {
  const gemma = model?.toLowerCase().startsWith('embeddinggemma') ?? false;
  const nomic = model?.toLowerCase().startsWith('nomic-embed-text') ?? false;
  return parseEmbeddingSettings({ version: 1, model, cpuOnly: true,
    documentPrefix: gemma ? 'title: none | text: ' : nomic ? 'search_document: ' : '',
    queryPrefix: gemma ? 'task: search result | query: ' : nomic ? 'search_query: ' : '',
  });
}
export function parseEmbeddingSettings(value: unknown): EmbeddingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EmbeddingSettingsError();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'cpuOnly,documentPrefix,model,queryPrefix,version'
    || row.version !== 1 || typeof row.cpuOnly !== 'boolean'
    || (row.model !== null && (typeof row.model !== 'string' || row.model.length > 200
      || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(row.model) || /(?:^|[-:])cloud$/i.test(row.model)))
    || typeof row.documentPrefix !== 'string' || typeof row.queryPrefix !== 'string'
    || [row.documentPrefix, row.queryPrefix].some(prefix => prefix.length > 128 || /[\p{Cc}\p{Cs}]/u.test(prefix))) throw new EmbeddingSettingsError();
  return Object.freeze({ version: 1, model: row.model as string | null, cpuOnly: row.cpuOnly, documentPrefix: row.documentPrefix, queryPrefix: row.queryPrefix });
}
function checkDirectory(directory: string) { checkRuntimePath(path.parse(path.resolve(directory)).root, path.resolve(directory)); }
export function loadEmbeddingSettings(directory: string): EmbeddingSettings {
  let descriptor: number | undefined;
  try {
    checkDirectory(directory);
    const file = path.join(directory, 'embedding-settings.json');
    if (lstatSync(file).isSymbolicLink()) throw new EmbeddingSettingsError();
    descriptor = openSync(file, 'r');
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 4096) throw new EmbeddingSettingsError();
    return parseEmbeddingSettings(JSON.parse(readFileSync(descriptor, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultEmbeddingSettings();
    throw new EmbeddingSettingsError();
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function configureEmbeddings(directory: string, model: string): void {
  const settings = defaultEmbeddingSettings(model);
  try {
    checkDirectory(directory); mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(directory, 'embedding-settings.json'), `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch { throw new EmbeddingSettingsError(); }
}

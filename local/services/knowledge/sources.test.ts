import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { syntheticPdf } from '../../tests/pdf-fixture.ts';
import { preparePrivateSource, privateSourcePath, readPdfSource, sourceHash } from './sources.ts';

it('copies approved bytes to digest-only private storage, preserves duplicates and rejects corrupt/symlink/remote/oversized sources', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ms003-sources-'));
  try {
    const bytes = syntheticPdf(['Synthetic source.']);
    const hash = preparePrivateSource(root, bytes);
    expect(hash).toBe(sourceHash(bytes)); expect(readPdfSource(privateSourcePath(root, hash))).toEqual(bytes);
    expect(preparePrivateSource(root, bytes)).toBe(hash); expect(readdirSync(path.join(root, 'sources'))).toEqual([`${hash}.pdf`]);
    writeFileSync(privateSourcePath(root, hash), syntheticPdf(['Corrupt synthetic replacement.']));
    expect(() => preparePrivateSource(root, bytes)).toThrow('source_unavailable');
    for (const file of ['https://example.invalid/a.pdf', '\\\\server\\a.pdf', '//server/a.pdf', path.join(root, 'missing'), root]) expect(() => readPdfSource(file)).toThrow('source_unavailable');
    const large = path.join(root, 'large.pdf'); writeFileSync(large, Buffer.alloc(10 * 1024 * 1024 + 1)); expect(() => readPdfSource(large)).toThrow('source_unavailable');
    mkdirSync(path.join(root, 'target')); symlinkSync(path.join(root, 'target'), path.join(root, 'link'), 'junction');
    expect(() => preparePrivateSource(path.join(root, 'link'), bytes)).toThrow('source_unavailable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

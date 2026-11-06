import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { workspaceRoot } from '../../packages/config/index.mjs';

/** @param {import('node:test').TestContext} t @param {boolean} copyCommands */
export function fixture(t, copyCommands = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'ms000-config-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('ms000-config-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  cpSync(path.join(workspaceRoot, '.env.example'), path.join(root, '.env.example'));
  if (copyCommands) {
    cpSync(path.join(workspaceRoot, 'packages/config'), path.join(root, 'packages/config'), { recursive: true });
    cpSync(path.join(workspaceRoot, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  }
  return root;
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadConfiguration } from '../../packages/config/index.mjs';
import { setupLocal } from '../../scripts/setup-local.mjs';
import { fixture } from './fixtures.mjs';

test('setup generates independent secrets and empty service directories; repeated setup preserves everything', (t) => {
  const root = fixture(t);
  const other = fixture(t);
  setupLocal(root);
  setupLocal(other);
  const config = loadConfiguration(root, {});
  assert.match(config.serviceToken, /^[a-f0-9]{64}$/);
  assert.notEqual(config.serviceToken, loadConfiguration(other, {}).serviceToken);
  assert.deepEqual(readdirSync(config.runtime.attendance), []);
  assert.deepEqual(readdirSync(config.runtime.knowledge), []);
  const contents = readFileSync(path.join(root, '.env'), 'utf8');
  const sentinel = path.join(config.runtime.attendance, 'synthetic.txt');
  writeFileSync(sentinel, 'preserve');
  assert.throws(() => setupLocal(root), /already exists/);
  assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), contents);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
});

test('setup refuses existing config paths, even invalid content or a directory', (t) => {
  for (const directory of [false, true]) {
    const root = fixture(t);
    if (directory) mkdirSync(path.join(root, '.env'));
    else writeFileSync(path.join(root, '.env'), 'synthetic-existing-secret');
    assert.throws(() => setupLocal(root), /already exists/);
    assert.equal(existsSync(path.join(root, '.runtime')), false);
    if (!directory) assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'synthetic-existing-secret');
  }
});

test('invalid or populated examples fail before creating config or runtime directories', (t) => {
  for (const contents of [
    'INTERNAL_SERVICE_TOKEN=synthetic-do-not-copy', 'APP_HOST=0.0.0.0\nINTERNAL_SERVICE_TOKEN=',
    'RUNTIME_DIR=../outside\nINTERNAL_SERVICE_TOKEN=', 'LOG_LEVEL=bad\nINTERNAL_SERVICE_TOKEN=',
    'INTERNAL_SERVICE_TOKEN=\nUNKNOWN=bad',
  ]) {
    const root = fixture(t);
    writeFileSync(path.join(root, '.env.example'), contents);
    assert.throws(() => setupLocal(root));
    assert.equal(existsSync(path.join(root, '.env')), false);
    assert.equal(existsSync(path.join(root, '.runtime')), false);
  }
});

test('setup handles a quoted blank token assignment with CRLF and spaces', (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.env.example'), '  INTERNAL_SERVICE_TOKEN = ""\r\nRUNTIME_DIR=.runtime/custom\r\n');
  setupLocal(root);
  assert.match(loadConfiguration(root, {}).serviceToken, /^[a-f0-9]{64}$/);
});

test('setup refuses runtime junctions and file collisions; existing contents survive', (t) => {
  const root = fixture(t);
  const external = fixture(t);
  writeFileSync(path.join(external, 'sentinel.txt'), 'preserve');
  symlinkSync(external, path.join(root, '.runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => setupLocal(root), /without symlinks or junctions/);
  assert.equal(existsSync(path.join(root, '.env')), false);
  assert.equal(readFileSync(path.join(external, 'sentinel.txt'), 'utf8'), 'preserve');
  assert.equal(existsSync(path.join(external, 'attendance')), false);
  const collision = fixture(t);
  mkdirSync(path.join(collision, '.runtime'));
  writeFileSync(path.join(collision, '.runtime/attendance'), 'preserve');
  assert.throws(() => setupLocal(collision), /real directories/);
  assert.equal(readFileSync(path.join(collision, '.runtime/attendance'), 'utf8'), 'preserve');
});

test('CLIs work outside their workspace, never print secrets and reject extra arguments', (t) => {
  const root = fixture(t, true);
  const other = fixture(t);
  const env = { ...process.env };
  for (const key of ['APP_HOST', 'GATEWAY_PORT', 'ATTENDANCE_PORT', 'KNOWLEDGE_PORT', 'ATTENDANCE_URL',
    'KNOWLEDGE_URL', 'OLLAMA_BASE_URL', 'OLLAMA_CHAT_MODEL', 'INTERNAL_SERVICE_TOKEN', 'RUNTIME_DIR', 'LOG_LEVEL']) delete env[key];
  const setup = path.join(root, 'scripts/setup-local.mjs');
  const check = path.join(root, 'scripts/check-config.mjs');
  const run = (/** @type {string} */ script, /** @type {string[]} */ args = [], overrides = env) =>
    spawnSync(process.execPath, [script, ...args], { cwd: other, env: overrides, encoding: 'utf8', timeout: 10000 });
  assert.equal(run(setup, ['--force']).status, 1);
  assert.equal(existsSync(path.join(root, '.env')), false);
  const first = run(setup);
  assert.equal(first.status, 0, first.stderr);
  const config = loadConfiguration(root, {});
  assert.ok(!first.stdout.includes(config.serviceToken));
  assert.equal(existsSync(path.join(other, '.env')), false);
  const valid = run(check);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /model is not configured/);
  const bad = run(check, [], { ...env, INTERNAL_SERVICE_TOKEN: 'synthetic-secret-do-not-echo' });
  assert.equal(bad.status, 1);
  assert.ok(!bad.stderr.includes('synthetic-secret-do-not-echo'));
  assert.ok(!bad.stderr.includes(' at '));
  assert.equal(run(check, ['--dump']).status, 1);
  const repeated = run(setup);
  assert.equal(repeated.status, 1);
  assert.equal(loadConfiguration(root, {}).serviceToken, config.serviceToken);
});

test('concurrent setup commands have one winner and preserve the generated secret', async (t) => {
  const root = fixture(t, true);
  const setup = path.join(root, 'scripts/setup-local.mjs');
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [setup], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 1]);
  assert.match(loadConfiguration(root, {}).serviceToken, /^[a-f0-9]{64}$/);
});

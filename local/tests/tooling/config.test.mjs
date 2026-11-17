import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import {
  ConfigurationError, defaults, loadConfiguration, parseConfiguration, parseConfigurationFile,
} from '../../packages/config/index.mjs';
import { setupLocal } from '../../scripts/setup-local.mjs';
import { fixture } from './fixtures.mjs';

const syntheticToken = 'a'.repeat(64);
const environment = { INTERNAL_SERVICE_TOKEN: syntheticToken };

test('defaults are loopback-only; no model is a valid configuration', (t) => {
  const root = fixture(t);
  const config = parseConfiguration(environment, root);
  assert.equal(config.host, '127.0.0.1');
  assert.deepEqual(config.ports, { gateway: 3000, attendance: 3001, knowledge: 3002, face: 3003, kiosk: 5173 });
  assert.deepEqual(config.urls, {
    attendance: 'http://127.0.0.1:3001', knowledge: 'http://127.0.0.1:3002', face: 'http://127.0.0.1:3003', ollama: 'http://127.0.0.1:11434',
  });
  assert.equal(config.model, null);
  assert.equal(config.faceEnabled, false);
  assert.equal(config.runtime.attendance, path.join(root, '.runtime/attendance'));
  assert.notEqual(config.runtime.attendance, config.runtime.knowledge);
  assert.deepEqual(environment, { INTERNAL_SERVICE_TOKEN: syntheticToken });
});

test('invalid binding, ports, token, model and log level fail without echoing values', (t) => {
  const root = fixture(t);
  const cases = [
    { APP_HOST: '0.0.0.0' }, { APP_HOST: 'localhost' },
    { FACE_ENABLED: 'true' }, { FACE_ENABLED: '' }, { FACE_PORT: '0' },
    ...['0', '65536', '-1', '3e3', '03000', '3000.5', '', ' 3000'].map(GATEWAY_PORT => ({ GATEWAY_PORT })),
    { INTERNAL_SERVICE_TOKEN: '' }, { INTERNAL_SERVICE_TOKEN: 'synthetic-secret-do-not-echo' },
    { OLLAMA_CHAT_MODEL: 'https://remote.invalid/model' }, { OLLAMA_CHAT_MODEL: 'model with spaces' },
    { OLLAMA_CHAT_MODEL: 'model:cloud' }, { OLLAMA_CHAT_MODEL: 'model-cloud' },
    { OLLAMA_CHAT_MODEL: 'm'.repeat(201) }, { LOG_LEVEL: 'verbose-synthetic' },
  ];
  for (const changes of cases) {
    assert.throws(() => parseConfiguration({ ...environment, ...changes }, root), (error) => {
      assert.ok(error instanceof ConfigurationError);
      for (const value of Object.values(changes)) {
        if (value.length > 12) assert.ok(!error.message.includes(value));
      }
      return true;
    });
  }
});

test('service and Ollama URLs reject aliases, remote origins and URL tricks', (t) => {
  const root = fixture(t);
  const unsafe = [
    'http://localhost:11434', 'http://[::1]:11434', 'http://127.1:11434', 'http://2130706433:11434',
    'http://0x7f000001:11434', 'http://127.0.0.1.evil.invalid:11434', 'http://192.168.1.2:11434',
    'https://127.0.0.1:11434', 'http://user:password@127.0.0.1:11434',
    'http://127.0.0.1:11434/api', 'http://127.0.0.1:11434?x=1', 'http://127.0.0.1:11434#x',
    'http://127.0.0.1:65536', 'http://127.0.0.1:0', 'http://127.0.0.1:011434',
    'http://%31%32%37.0.0.1:11434', 'http://127.0.0.1:11434\\@remote.invalid',
  ];
  for (const key of ['ATTENDANCE_URL', 'KNOWLEDGE_URL', 'FACE_URL', 'OLLAMA_BASE_URL']) {
    for (const value of unsafe) assert.throws(() => parseConfiguration({ ...environment, [key]: value }, root), ConfigurationError);
  }
});

test('ports match service URLs and cannot collide with services, Vite or Ollama', (t) => {
  const root = fixture(t);
  for (const changes of [
    { ATTENDANCE_URL: 'http://127.0.0.1:3005' },
    { KNOWLEDGE_URL: 'http://127.0.0.1:3005' },
    { FACE_URL: 'http://127.0.0.1:3005' },
    { GATEWAY_PORT: '3001' }, { GATEWAY_PORT: '5173' }, { GATEWAY_PORT: '11434' },
    { ATTENDANCE_PORT: '3002', ATTENDANCE_URL: 'http://127.0.0.1:3002' },
    { FACE_PORT: '5173', FACE_URL: 'http://127.0.0.1:5173' },
  ]) assert.throws(() => parseConfiguration({ ...environment, ...changes }, root), ConfigurationError);
  const config = parseConfiguration({
    ...environment, ATTENDANCE_PORT: '3101', ATTENDANCE_URL: 'http://127.0.0.1:3101/',
    OLLAMA_CHAT_MODEL: 'synthetic/model:test',
  }, root);
  assert.equal(config.ports.attendance, 3101);
  assert.equal(config.urls.attendance, 'http://127.0.0.1:3101');
  assert.equal(config.model, 'synthetic/model:test');
});

test('runtime storage stays in the workspace ignored tree regardless of cwd', (t) => {
  const root = fixture(t);
  for (const RUNTIME_DIR of ['', '..', '../outside', '.runtime/../../outside', '//server/share', '\\\\server\\share', 'data']) {
    assert.throws(() => parseConfiguration({ ...environment, RUNTIME_DIR }, root), ConfigurationError);
  }
  const config = parseConfiguration({ ...environment, RUNTIME_DIR: '.runtime/custom' }, root);
  assert.equal(config.runtime.root, path.join(root, '.runtime/custom'));
});

test('configuration files accept CRLF, comments and quoted values; reject typos and duplicates', () => {
  assert.deepEqual(parseConfigurationFile('# comment\r\nLOG_LEVEL="warn" # comment\r\n'), { LOG_LEVEL: 'warn' });
  for (const contents of [
    'GATWAY_PORT=4000', 'LOG_LEVEL=info\nLOG_LEVEL=debug', 'not an assignment',
    'OLLAMA_CHAT_MODEL="unfinished', 'LOG_LEVEL="multi\nline"', '#'.repeat(16385),
  ]) assert.throws(() => parseConfigurationFile(contents), ConfigurationError);
});

test('loader uses explicit environment overrides without mutating process.env or creating files', (t) => {
  const root = fixture(t);
  setupLocal(root);
  const envPath = path.join(root, '.env');
  const original = readFileSync(envPath, 'utf8');
  const before = { ...process.env };
  const config = loadConfiguration(root, { LOG_LEVEL: 'warn', OLLAMA_CHAT_MODEL: 'synthetic:test', UNRELATED: 'ignored' });
  assert.equal(config.logLevel, 'warn');
  assert.equal(config.model, 'synthetic:test');
  assert.equal(readFileSync(envPath, 'utf8'), original);
  assert.ok(isDeepStrictEqual({ ...process.env }, before), 'loader must not modify the process environment');
  assert.throws(() => loadConfiguration(root, { APP_HOST: '0.0.0.0' }), ConfigurationError);
  assert.throws(() => loadConfiguration(root, { INTERNAL_SERVICE_TOKEN: '' }), ConfigurationError);
});

test('missing, oversized or non-file .env fails with a safe error', (t) => {
  const root = fixture(t);
  assert.throws(() => loadConfiguration(root, {}), /Cannot read local .env/);
  writeFileSync(path.join(root, '.env'), 'x'.repeat(16385));
  assert.throws(() => loadConfiguration(root, {}), /at most 16 KiB/);
  const other = fixture(t);
  mkdirSync(path.join(other, '.env'));
  assert.throws(() => loadConfiguration(other, {}), /regular file/);
});

test('loader refuses a runtime junction rather than accepting an external directory', (t) => {
  const root = fixture(t);
  const external = fixture(t);
  writeFileSync(path.join(root, '.env'), Object.entries({ ...defaults, ...environment }).map(([k, v]) => `${k}=${v}`).join('\n'));
  symlinkSync(external, path.join(root, '.runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => loadConfiguration(root, {}), /without symlinks or junctions/);
});

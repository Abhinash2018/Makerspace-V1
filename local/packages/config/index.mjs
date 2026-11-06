import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

export const defaults = Object.freeze({
  APP_HOST: '127.0.0.1',
  GATEWAY_PORT: '3000',
  ATTENDANCE_PORT: '3001',
  KNOWLEDGE_PORT: '3002',
  ATTENDANCE_URL: 'http://127.0.0.1:3001',
  KNOWLEDGE_URL: 'http://127.0.0.1:3002',
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  OLLAMA_CHAT_MODEL: '',
  INTERNAL_SERVICE_TOKEN: '',
  RUNTIME_DIR: '.runtime',
  LOG_LEVEL: 'info',
});

// Messages contain field names and fixed guidance, never supplied values.
export class ConfigurationError extends Error {}

/** @param {string} key @param {string} guidance @returns {never} */
function invalid(key, guidance) {
  throw new ConfigurationError(`${key}: ${guidance}`);
}

/** @param {string} value @param {string} key */
function port(value, key) {
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535) {
    invalid(key, 'use a decimal port from 1 to 65535.');
  }
  return Number(value);
}

/** @param {string} value @param {string} key */
function loopbackUrl(value, key) {
  // Validate before URL normalization: aliases, credentials and encoded hosts
  // must not silently become an allowed destination.
  const match = /^http:\/\/127\.0\.0\.1(?::([1-9][0-9]{0,4}))?\/?$/.exec(value);
  if (!match) invalid(key, 'use an HTTP origin on literal 127.0.0.1, without credentials, path, query or fragment.');
  const destinationPort = port(match[1] ?? '80', key);
  return { origin: new URL(value).origin, port: destinationPort };
}

/**
 * Parse common technical settings without changing process.env or doing I/O.
 * Each future service still owns its startup configuration and domain schema.
 * @param {Record<string, string | undefined>} environment
 * @param {string} root
 */
export function parseConfiguration(environment, root = workspaceRoot) {
  /** @type {Record<keyof typeof defaults, string>} */
  const settings = { ...defaults };
  for (const key of /** @type {(keyof typeof defaults)[]} */ (Object.keys(defaults))) {
    settings[key] = environment[key] ?? defaults[key];
  }
  if (settings.APP_HOST !== '127.0.0.1') invalid('APP_HOST', 'use literal 127.0.0.1.');
  const ports = {
    gateway: port(settings.GATEWAY_PORT, 'GATEWAY_PORT'),
    attendance: port(settings.ATTENDANCE_PORT, 'ATTENDANCE_PORT'),
    knowledge: port(settings.KNOWLEDGE_PORT, 'KNOWLEDGE_PORT'),
    kiosk: 5173,
  };
  const attendance = loopbackUrl(settings.ATTENDANCE_URL, 'ATTENDANCE_URL');
  const knowledge = loopbackUrl(settings.KNOWLEDGE_URL, 'KNOWLEDGE_URL');
  const ollama = loopbackUrl(settings.OLLAMA_BASE_URL, 'OLLAMA_BASE_URL');
  if (attendance.port !== ports.attendance) invalid('ATTENDANCE_URL', 'port must match ATTENDANCE_PORT.');
  if (knowledge.port !== ports.knowledge) invalid('KNOWLEDGE_URL', 'port must match KNOWLEDGE_PORT.');
  const allPorts = [...Object.values(ports), ollama.port];
  if (new Set(allPorts).size !== allPorts.length) {
    invalid('Ports', 'gateway, attendance, knowledge, Vite (5173) and Ollama must use distinct ports.');
  }
  if (!/^[a-f0-9]{64}$/i.test(settings.INTERNAL_SERVICE_TOKEN)) {
    invalid('INTERNAL_SERVICE_TOKEN', 'a 64-character hexadecimal secret is required; use setup:local for first setup.');
  }
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(settings.LOG_LEVEL)) {
    invalid('LOG_LEVEL', 'use fatal, error, warn, info, debug, trace or silent.');
  }
  const model = settings.OLLAMA_CHAT_MODEL;
  if (model && (model.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(model))) {
    invalid('OLLAMA_CHAT_MODEL', 'use a model identifier, or leave blank; URLs and whitespace are not allowed.');
  }
  if (/(?:^|[-:])cloud$/i.test(model)) {
    invalid('OLLAMA_CHAT_MODEL', 'select a downloaded local model; cloud-tagged models are not supported.');
  }
  const runtimeSetting = settings.RUNTIME_DIR;
  const runtimeBase = path.resolve(root, '.runtime');
  const runtimeRoot = path.resolve(root, runtimeSetting);
  const relative = path.relative(runtimeBase, runtimeRoot);
  if (!runtimeSetting || /[\0\r\n]/.test(runtimeSetting) || /^(?:\\\\|\/\/)/.test(runtimeSetting)
    || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    invalid('RUNTIME_DIR', 'use a directory within the workspace .runtime tree.');
  }
  return {
    host: '127.0.0.1',
    ports,
    urls: { attendance: attendance.origin, knowledge: knowledge.origin, ollama: ollama.origin },
    model: model || null,
    serviceToken: settings.INTERNAL_SERVICE_TOKEN,
    logLevel: settings.LOG_LEVEL,
    runtime: {
      root: runtimeRoot,
      attendance: path.join(runtimeRoot, 'attendance'),
      knowledge: path.join(runtimeRoot, 'knowledge'),
    },
  };
}

/** @param {string} source */
export function parseConfigurationFile(source) {
  if (Buffer.byteLength(source) > 16384) throw new ConfigurationError('Configuration file exceeds 16 KiB.');
  const seen = new Set();
  // Deliberately accept one assignment per line, including quoted single-line
  // values and comments. Refuse typos/duplicates instead of silently defaulting.
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const assignment = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const key = assignment?.[1];
    const value = assignment?.[2] ?? '';
    if (!key || !Object.hasOwn(defaults, key) || seen.has(key)
      || (/^['"]/.test(value) && !/^(['"]).*\1\s*(?:#.*)?$/.test(value))) {
      throw new ConfigurationError('Configuration file requires unique, supported KEY=value assignments on single lines.');
    }
    seen.add(key);
  }
  return parseEnv(source);
}

/**
 * Refuse symlink/junction runtime directories. No files or directories change.
 * This is not a defense against an attacker with concurrent local OS access.
 * @param {string} root @param {string} target
 */
export function checkRuntimePath(root, target) {
  let current = path.resolve(root);
  for (const segment of path.relative(current, target).split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        invalid('RUNTIME_DIR', 'runtime path components must be real directories, without symlinks or junctions.');
      }
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
    }
  }
}

/** @param {string} root @param {Record<string, string | undefined>} environment */
export function loadConfiguration(root = workspaceRoot, environment = process.env) {
  let contents;
  try {
    const filename = path.join(root, '.env');
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) {
      throw new ConfigurationError('Local .env must be a regular file of at most 16 KiB.');
    }
    contents = readFileSync(filename, 'utf8');
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError('Cannot read local .env; run setup:local for first setup and check file access.');
  }
  const fileSettings = parseConfigurationFile(contents);
  for (const key of Object.keys(defaults)) {
    if (environment[key] !== undefined) fileSettings[key] = environment[key];
  }
  const config = parseConfiguration(fileSettings, root);
  try {
    checkRuntimePath(root, config.runtime.attendance);
    checkRuntimePath(root, config.runtime.knowledge);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError('Cannot inspect runtime directories; check local file access.');
  }
  return config;
}

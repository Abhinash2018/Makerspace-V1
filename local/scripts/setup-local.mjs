import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ConfigurationError, checkRuntimePath, parseConfiguration, parseConfigurationFile, workspaceRoot,
} from '../packages/config/index.mjs';

export class SetupError extends Error {}

/** @param {string} root */
export function setupLocal(root = workspaceRoot) {
  const destination = path.join(root, '.env');
  try {
    lstatSync(destination);
    throw new SetupError('Local .env already exists; it has not been replaced. Review it manually.');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
  }
  try {
    const template = readFileSync(path.join(root, '.env.example'), 'utf8');
    const settings = parseConfigurationFile(template);
    if (settings.INTERNAL_SERVICE_TOKEN !== '') {
      throw new SetupError('The example must contain a blank INTERNAL_SERVICE_TOKEN assignment.');
    }
    const token = randomBytes(32).toString('hex');
    const config = parseConfiguration({ ...settings, INTERNAL_SERVICE_TOKEN: token }, root);
    const targets = [config.runtime.attendance, config.runtime.knowledge];
    for (const target of targets) checkRuntimePath(root, target);
    for (const target of targets) mkdirSync(target, { recursive: true, mode: 0o700 });
    // Exclusive creation also refuses a file or symlink created after lstat.
    writeFileSync(destination, template.replace(/^[ \t]*INTERNAL_SERVICE_TOKEN[ \t]*=.*$/m, `INTERNAL_SERVICE_TOKEN=${token}`), {
      flag: 'wx', mode: 0o600, encoding: 'utf8',
    });
  } catch (error) {
    if (error instanceof SetupError || error instanceof ConfigurationError) throw error;
    throw new SetupError('Local setup could not finish. Check file access and existing .env/runtime paths; nothing is overwritten.');
  }
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) throw new SetupError('Usage: pnpm setup:local (no arguments).');
    setupLocal();
    console.log('Created local .env and service runtime directories. No models downloaded; model selection is optional.');
  } catch (error) {
    console.error(error instanceof SetupError || error instanceof ConfigurationError
      ? error.message : 'Local setup failed; check local file access.');
    process.exitCode = 1;
  }
}

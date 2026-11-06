import { ConfigurationError, loadConfiguration } from '../packages/config/index.mjs';

try {
  if (process.argv.length !== 2) throw new ConfigurationError('Usage: pnpm config:check (no arguments).');
  const config = loadConfiguration();
  console.log(config.model === null
    ? 'Local configuration is valid. Chat model is not configured.'
    : 'Local configuration is valid. Model installation has not been checked.');
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Configuration check failed; check local file access.');
  process.exitCode = 1;
}

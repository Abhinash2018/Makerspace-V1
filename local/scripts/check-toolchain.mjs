import { readFileSync } from 'node:fs';

// Resolve pins from this file's location so the check also works outside local/.
const workspace = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', workspace), 'utf8'));
const nodeVersion = readFileSync(new URL('.node-version', workspace), 'utf8').trim();
const pnpmVersion = manifest.engines.pnpm;
const failures = [];

if (manifest.engines.node !== nodeVersion) {
  failures.push('Node pins disagree: align .node-version and package.json engines.node.');
}
if (manifest.packageManager !== `pnpm@${pnpmVersion}`) {
  failures.push('pnpm pins disagree: align packageManager and engines.pnpm in package.json.');
}
if (process.versions.node !== nodeVersion) {
  failures.push(`Use Node ${nodeVersion}; the active version is ${process.versions.node}.`);
}

const userAgent = process.env.npm_config_user_agent;
if (userAgent && userAgent.split(' ')[0] !== `pnpm/${pnpmVersion}`) {
  failures.push(`Use pnpm ${pnpmVersion} for this workspace.`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else if (userAgent) {
  console.log(`Toolchain OK: Node ${nodeVersion}, pnpm ${pnpmVersion}.`);
} else {
  console.log(`Node ${nodeVersion} verified; run pnpm check:toolchain to verify pnpm ${pnpmVersion}.`);
}

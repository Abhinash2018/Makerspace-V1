import { loadConfiguration } from '../../packages/config/index.mjs';
import { cleanupVisits } from './visits.ts';

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) throw new Error('usage');
    const removed = cleanupVisits(loadConfiguration().runtime.attendance);
    console.log(`Removed expired attendance visits: ${removed}.`);
  } catch {
    console.error('Attendance cleanup failed. Use no arguments; check configuration, migrations and private database access.');
    process.exitCode = 1;
  }
}

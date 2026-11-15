import { loadConfiguration } from '../../packages/config/index.mjs';
import { cleanupVisits } from './visits.ts';
import { createPhotoRepository } from './photo-repository.ts';

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) throw new Error('usage');
    const directory = loadConfiguration().runtime.attendance;
    const removed = cleanupVisits(directory);
    const photos = createPhotoRepository(directory).cleanup();
    if (photos.failed) throw new Error('cleanup_failed');
    console.log(`Removed expired attendance visits: ${removed}.`);
    console.log(`Removed queued photos: ${photos.removed}; pending: ${photos.pending}.`);
  } catch {
    console.error('Attendance cleanup failed. Use no arguments; check configuration, migrations and private database access.');
    process.exitCode = 1;
  }
}

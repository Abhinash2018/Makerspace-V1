import path from 'node:path';
import { loadConfiguration } from '../../packages/config/index.mjs';
import { configureFace, loadFaceSettings } from './settings.ts';
import { migrateFace, openFace } from './database.ts';
import { createFaceRepository } from './repository.ts';

if (import.meta.main) {
  try {
    const args = process.argv.slice(2), command = args.shift(), directory = loadConfiguration().runtime.face;
    if (command === 'configure') {
      if (args.length !== 5 || args[0] !== '--approved' || args[1] !== '--detector' || args[3] !== '--recognizer' || !path.isAbsolute(args[2]!) || !path.isAbsolute(args[4]!)) throw new Error();
      configureFace(directory, args[2]!, args[4]!, true);
      console.log('Approved pinned face models and new encryption key configured. Run explicit migrations before enabling.');
    } else if (command === 'migrate' && args.length === 0) { migrateFace(directory); console.log('Face migrations are current.'); }
    else if (command === 'cleanup' && args.length === 0) console.log(JSON.stringify({ removed: createFaceRepository(directory).cleanup() }));
    else if (command === 'status' && args.length === 0) { loadFaceSettings(directory); const db = openFace(directory); db.close(); console.log('Local face storage and pinned models are ready.'); }
    else throw new Error();
  } catch { console.error('Face command failed. Use configure --approved --detector <absolute local file> --recognizer <absolute local file>, migrate, status, or cleanup. Existing settings/keys are never overwritten.'); process.exitCode = 1; }
}

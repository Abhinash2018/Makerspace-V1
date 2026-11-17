import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import path from 'node:path';
import { modelId } from '../services/face/settings.ts';

// Repository/authentication unit tests intentionally have no native model files.
export function syntheticFaceSettings(directory: string) {
  mkdirSync(directory, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(path.join(directory, 'encryption.key'), key);
  writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ version: 1, modelId, keyCheck: createHmac('sha256', key).update('face-key-check-v1').digest('hex') }));
  return key;
}
export function syntheticVector(index = 0) { return Array.from({ length: 128 }, (_, position) => position === index ? 1 : 0); }

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkRuntimePath } from '../../packages/config/index.mjs';

export const assets = {
  detector: { filename: 'detector.onnx', bytes: 232589, hash: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4' },
  recognizer: { filename: 'recognizer.onnx', bytes: 38696353, hash: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79' },
} as const;
export const modelId = createHash('sha256').update(JSON.stringify({ assets, preprocessing: 'yunet640-bgr-nms0.3-score0.9-similarity112-rgb-raw-l2-v1', threshold: 0.65, margin: 0.10 })).digest('hex');
export class FaceFailure extends Error {
  readonly code: 'face_unavailable' | 'invalid_face' | 'face_conflict' | 'face_not_found' | 'rate_limited';
  constructor(code: FaceFailure['code'] = 'face_unavailable') { super(code); this.code = code; }
}
export function privateFile(file: string, maximum: number) {
  checkRuntimePath(path.parse(path.resolve(file)).root, path.dirname(path.resolve(file)));
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new FaceFailure();
  return readFileSync(file);
}
function approvedModel(file: string, asset: typeof assets[keyof typeof assets]) {
  if (!path.isAbsolute(file) || /^(?:\\\\|\/\/)/.test(file)) throw new FaceFailure();
  const bytes = privateFile(file, asset.bytes);
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.hash) throw new FaceFailure();
}
export function configureFace(directory: string, detector: string, recognizer: string, approved: boolean) {
  if (!approved) throw new FaceFailure();
  approvedModel(detector, assets.detector); approvedModel(recognizer, assets.recognizer);
  checkRuntimePath(path.parse(path.resolve(directory)).root, directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const name of ['settings.json', 'encryption.key', 'detector.onnx', 'recognizer.onnx']) {
    try { lstatSync(path.join(directory, name)); throw new FaceFailure(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const key = randomBytes(32);
  copyFileSync(detector, path.join(directory, 'detector.onnx'), constants.COPYFILE_EXCL);
  copyFileSync(recognizer, path.join(directory, 'recognizer.onnx'), constants.COPYFILE_EXCL);
  writeFileSync(path.join(directory, 'encryption.key'), key, { flag: 'wx', mode: 0o600 });
  const keyCheck = createHmac('sha256', key).update('face-key-check-v1').digest('hex');
  writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ version: 1, modelId, keyCheck }), { flag: 'wx', mode: 0o600 });
}
export function loadFaceSettings(directory: string, verifyModels = true) {
  try {
    const settings: unknown = JSON.parse(privateFile(path.join(directory, 'settings.json'), 1024).toString('utf8'));
    const key = privateFile(path.join(directory, 'encryption.key'), 32);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new FaceFailure();
    const row = settings as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'keyCheck,modelId,version' || row.version !== 1 || row.modelId !== modelId || key.length !== 32
      || row.keyCheck !== createHmac('sha256', key).update('face-key-check-v1').digest('hex')) throw new FaceFailure();
    if (verifyModels) for (const asset of Object.values(assets)) approvedModel(path.join(directory, asset.filename), asset);
    return { key, modelId, detector: path.join(directory, assets.detector.filename), recognizer: path.join(directory, assets.recognizer.filename) };
  } catch { throw new FaceFailure(); }
}

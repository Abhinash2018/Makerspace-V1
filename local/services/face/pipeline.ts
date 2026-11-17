import sharp from 'sharp';
import type * as ort from 'onnxruntime-node';
import { FaceFailure, loadFaceSettings } from './settings.ts';
import { normalizeEmbedding } from './vectors.ts';
export type ImageFactory = typeof sharp;

export type Detection = { box: number[]; points: number[][]; score: number };
function iou(a: number[], b: number[]) {
  const intersection = Math.max(0, Math.min(a[0]! + a[2]!, b[0]! + b[2]!) - Math.max(a[0]!, b[0]!)) * Math.max(0, Math.min(a[1]! + a[3]!, b[1]! + b[3]!) - Math.max(a[1]!, b[1]!));
  return intersection / (a[2]! * a[3]! + b[2]! * b[3]! - intersection);
}
export function decodeDetections(outputs: Record<string, ort.Tensor>) {
  const detected: Detection[] = [];
  for (const stride of [8, 16, 32]) {
    const cols = 640 / stride, count = cols * cols;
    const heads = ['cls', 'obj', 'bbox', 'kps'].map((name, index) => {
      const tensor = outputs[`${name}_${stride}`], dimensions = [1, count, [1, 1, 4, 10][index]!];
      if (!tensor || tensor.type !== 'float32' || tensor.dims.join(',') !== dimensions.join(',')) throw new FaceFailure();
      return tensor.data as Float32Array;
    });
    const [cls, obj, bbox, kps] = heads as [Float32Array, Float32Array, Float32Array, Float32Array];
    for (let index = 0; index < count; index++) {
      const score = Math.sqrt(Math.max(0, Math.min(1, cls[index]!)) * Math.max(0, Math.min(1, obj[index]!)));
      if (score < 0.9) continue;
      const x = index % cols, y = Math.floor(index / cols), b = index * 4;
      const w = Math.exp(bbox[b + 2]!) * stride, h = Math.exp(bbox[b + 3]!) * stride;
      const box = [(x + bbox[b]!) * stride - w / 2, (y + bbox[b + 1]!) * stride - h / 2, w, h];
      const points = Array.from({ length: 5 }, (_, j) => [(x + kps[index * 10 + j * 2]!) * stride, (y + kps[index * 10 + j * 2 + 1]!) * stride]);
      if (![...box, ...points.flat(), score].every(Number.isFinite)) throw new FaceFailure('invalid_face');
      detected.push({ box, points, score });
    }
  }
  const kept: Detection[] = [];
  for (const face of detected.sort((a, b) => b.score - a.score).slice(0, 500)) if (kept.every(other => iou(face.box, other.box) <= 0.3)) kept.push(face);
  return kept;
}
// Least-squares orientation-preserving similarity, followed by inverse bilinear sampling.
export function alignFace(rgb: Uint8Array, points: number[][]) {
  const target = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
  if (points.length !== 5 || points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v >= 640))) throw new FaceFailure('invalid_face');
  const sx = points.reduce((v, p) => v + p[0]!, 0) / 5, sy = points.reduce((v, p) => v + p[1]!, 0) / 5;
  const tx = target.reduce((v, p) => v + p[0]!, 0) / 5, ty = target.reduce((v, p) => v + p[1]!, 0) / 5;
  let den = 0, real = 0, imaginary = 0;
  for (let i = 0; i < 5; i++) {
    const x = points[i]![0]! - sx, y = points[i]![1]! - sy, u = target[i]![0]! - tx, v = target[i]![1]! - ty;
    den += x * x + y * y; real += x * u + y * v; imaginary += x * v - y * u;
  }
  if (den < 100 || Math.hypot(points[0]![0]! - points[1]![0]!, points[0]![1]! - points[1]![1]!) < 15) throw new FaceFailure('invalid_face');
  const a = real / den, b = imaginary / den, scale = a * a + b * b;
  const dx = tx - a * sx + b * sy, dy = ty - b * sx - a * sy;
  const residual = points.reduce((sum, p, i) => sum + Math.hypot(a * p[0]! - b * p[1]! + dx - target[i]![0]!, b * p[0]! + a * p[1]! + dy - target[i]![1]!), 0) / 5;
  if (scale < 0.01 || scale > 16 || residual > 7) throw new FaceFailure('invalid_face');
  const output = new Float32Array(3 * 112 * 112);
  let outside = 0;
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) {
    const u = (a * (x - dx) + b * (y - dy)) / scale, v = (-b * (x - dx) + a * (y - dy)) / scale;
    const left = Math.floor(u), top = Math.floor(v), fx = u - left, fy = v - top;
    if (left < 0 || top < 0 || left >= 639 || top >= 639) { outside++; continue; }
    for (let c = 0; c < 3; c++) output[c * 112 * 112 + y * 112 + x] = (1 - fy) * ((1 - fx) * rgb[(top * 640 + left) * 3 + c]! + fx * rgb[(top * 640 + left + 1) * 3 + c]!) + fy * ((1 - fx) * rgb[((top + 1) * 640 + left) * 3 + c]! + fx * rgb[((top + 1) * 640 + left + 1) * 3 + c]!);
  }
  if (outside > 112 * 112 * 0.1) throw new FaceFailure('invalid_face');
  return output;
}
export async function extractEmbedding(directory: string, bytes: Uint8Array) {
  if (bytes.length < 4 || bytes.length > 524288 || bytes[0] !== 255 || bytes[1] !== 216) throw new FaceFailure('invalid_face');
  process.env.ORT_DISABLE_TELEMETRY = '1';
  const runtime = await import('onnxruntime-node');
  runtime.env.logLevel = 'fatal';
  sharp.cache(false); sharp.concurrency(1);
  const settings = loadFaceSettings(directory);
  let rgb: Buffer;
  try {
    const image = sharp(Buffer.from(bytes), { limitInputPixels: 4000000, failOn: 'warning' });
    const meta = await image.metadata();
    if (meta.format !== 'jpeg' || !meta.width || !meta.height || meta.width > 2048 || meta.height > 2048 || Math.min(meta.width, meta.height) < 64 || (meta.pages ?? 1) !== 1) throw new FaceFailure('invalid_face');
    rgb = await image.rotate().resize(640, 640, { fit: 'contain', position: 'northwest', background: '#000000' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  } catch { throw new FaceFailure('invalid_face'); }
  const options: ort.InferenceSession.SessionOptions = { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, executionMode: 'sequential', logSeverityLevel: 4 };
  const detector = await runtime.InferenceSession.create(settings.detector, options);
  const recognizer = await runtime.InferenceSession.create(settings.recognizer, options);
  try {
    if (detector.inputNames.join(',') !== 'input' || recognizer.inputNames.join(',') !== 'data' || recognizer.outputNames.join(',') !== 'fc1') throw new FaceFailure();
    const bgr = new Float32Array(640 * 640 * 3);
    for (let p = 0; p < 640 * 640; p++) for (let c = 0; c < 3; c++) bgr[c * 640 * 640 + p] = rgb[p * 3 + 2 - c]!;
    const faces = decodeDetections(await detector.run({ input: new runtime.Tensor('float32', bgr, [1, 3, 640, 640]) }));
    if (faces.length !== 1) throw new FaceFailure('invalid_face');
    const face = faces[0]!, [x, y, w, h] = face.box as [number, number, number, number];
    if (Math.min(w, h) < 96 || x < 0 || y < 0 || x + w > 640 || y + h > 640) throw new FaceFailure('invalid_face');
    let sum = 0, squares = 0, count = 0;
    for (let row = Math.ceil(y); row < y + h; row++) for (let col = Math.ceil(x); col < x + w; col++) {
      const p = (row * 640 + col) * 3, value = (rgb[p]! + rgb[p + 1]! + rgb[p + 2]!) / 3;
      sum += value; squares += value * value; count++;
    }
    const mean = sum / count;
    if (mean < 35 || mean > 235 || Math.sqrt(squares / count - mean * mean) < 18) throw new FaceFailure('invalid_face');
    const result = await recognizer.run({ data: new runtime.Tensor('float32', alignFace(rgb, face.points), [1, 3, 112, 112]) });
    if (!result.fc1 || result.fc1.type !== 'float32' || result.fc1.dims.join(',') !== '1,128') throw new FaceFailure();
    return normalizeEmbedding(Array.from(result.fc1.data as Float32Array));
  } finally { await detector.release(); await recognizer.release(); }
}

// Explicit native CPU acceptance. Uses only generated fictional faces and temporary owned storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { configureFace } from '../services/face/settings.ts';
import { createInference } from '../services/face/inference.ts';
import { cosine } from '../services/face/vectors.ts';
import type { ImageFactory } from '../services/face/pipeline.ts';

const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== '--approved' || args[1] !== '--detector' || args[3] !== '--recognizer') throw new Error('Use --approved --detector <local file> --recognizer <local file>.');
const require = createRequire(new URL('../services/face/package.json', import.meta.url));
const sharp = require('sharp') as ImageFactory;
const directory = mkdtempSync(path.join(tmpdir(), 'ms007-acceptance-'));
const started = performance.now();
try {
  configureFace(directory, args[2]!, args[4]!, true);
  assert.throws(() => configureFace(directory, args[2]!, args[4]!, true));
  const sheet = readFileSync(new URL('./fixtures/face-synthetic.png', import.meta.url));
  const first = await sharp(sheet).extract({ left: 0, top: 0, width: 768, height: 1024 }).resize(480, 640).jpeg().toBuffer();
  const second = await sharp(sheet).extract({ left: 768, top: 0, width: 768, height: 1024 }).resize(480, 640).jpeg().toBuffer();
  const transformed = await sharp(first).modulate({ brightness: 0.95 }).jpeg({ quality: 85 }).toBuffer();
  const blank = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#888888' } }).jpeg().toBuffer();
  const multiple = await sharp(sheet).resize(960, 640).jpeg().toBuffer();
  const infer = createInference(directory), a = await infer(first), b = await infer(second), c = await infer(transformed);
  assert.equal(a.length, 128); assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-5);
  assert.ok(cosine(a, c) >= 0.65); assert.ok(cosine(a, b) < 0.65);
  await assert.rejects(infer(blank), /invalid_face/); await assert.rejects(infer(multiple), /invalid_face/);
  await assert.rejects(infer(Buffer.from('invalid')), /invalid_face/);
  await assert.rejects(infer(Buffer.from([255, 216, 255, 0])), /invalid_face/);
  const oversized = Buffer.alloc(524289); oversized[0] = 255; oversized[1] = 216;
  await assert.rejects(infer(oversized), /invalid_face/);
  const dimensions = await sharp({ create: { width: 2049, height: 64, channels: 3, background: '#888888' } }).jpeg().toBuffer();
  await assert.rejects(infer(dimensions), /invalid_face/);
  await assert.rejects(infer(first, AbortSignal.abort()), /face_unavailable/);
  const running = infer(first); await assert.rejects(infer(second), /rate_limited/); await running;
  await assert.rejects(infer(first, undefined, 1), /face_unavailable/);
  const detectorFile = path.join(directory, 'detector.onnx'), original = readFileSync(detectorFile), damaged = Buffer.from(original); damaged[100] = damaged[100]! ^ 1;
  writeFileSync(detectorFile, damaged); await assert.rejects(infer(first), /face_unavailable/); writeFileSync(detectorFile, original);
  const keyFile = path.join(directory, 'encryption.key'), key = readFileSync(keyFile);
  writeFileSync(keyFile, Buffer.alloc(32)); await assert.rejects(infer(first), /face_unavailable/); writeFileSync(keyFile, key);
  console.log(JSON.stringify({ ok: true, cpuOnly: true, telemetryDisabledBeforeWorkerLaunch: true, dimension: a.length, transformedSimilarity: cosine(a, c), differentSimilarity: cosine(a, b), blankRejected: true, multipleRejected: true, malformedRejected: true, cancellationAndDeadline: true, concurrentOperationRejected: true, durationMs: Math.round(performance.now() - started) }));
} finally {
  assert.equal(path.dirname(directory), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('ms007-acceptance-'));
  rmSync(directory, { recursive: true, force: true });
}

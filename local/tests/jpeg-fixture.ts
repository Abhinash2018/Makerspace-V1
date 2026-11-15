import { createRequire } from 'node:module';

// The codec belongs to attendance; fixtures resolve its declared dependency.
const sharp = createRequire(new URL('../services/attendance/package.json', import.meta.url))('sharp');
export async function syntheticJpeg(background = '#537860'): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background } }).jpeg().toBuffer();
}

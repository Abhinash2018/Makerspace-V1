import sharp from 'sharp';

if (!process.send) throw new Error('Image worker entrypoint only.');
sharp.cache(false); sharp.concurrency(1);
process.once('disconnect', () => process.exit(1));
process.once('message', async (value: { bytes?: unknown }) => {
  try {
    if (!(value?.bytes instanceof Uint8Array) || value.bytes.length < 4 || value.bytes.length > 524288 || value.bytes[0] !== 255 || value.bytes[1] !== 216) throw new Error();
    const bytes = Buffer.from(value.bytes);
    const metadata = await sharp(bytes, { limitInputPixels: 4000000, failOn: 'warning', sequentialRead: true }).metadata();
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || metadata.width > 2048 || metadata.height > 2048 || metadata.width * metadata.height > 4000000 || (metadata.pages ?? 1) !== 1) throw new Error();
    const { data, info } = await sharp(bytes, { limitInputPixels: 4000000, failOn: 'warning', sequentialRead: true }).rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75, progressive: false }).timeout({ seconds: 3 }).toBuffer({ resolveWithObject: true });
    if (data.length > 262144) throw new Error();
    process.send!({ bytes: data, width: info.width, height: info.height }, () => process.exit(0));
  } catch { process.send!({ error: 'invalid_photo' }, () => process.exit(1)); }
});

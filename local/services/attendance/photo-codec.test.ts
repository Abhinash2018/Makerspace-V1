import sharp from 'sharp';
import { expect, it } from 'vitest';
import { sanitizePhoto } from './photo-codec.ts';

it('re-encodes real synthetic JPEG bytes in an isolated child, auto-orients/resizes and strips metadata', async () => {
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:description>Synthetic fixture</dc:description></rdf:Description></rdf:RDF></x:xmpmeta>';
  const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#537860' } }).jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: 'Synthetic fixture metadata' } }).withXmp(xmp).toBuffer();
  const before = await sharp(original).metadata(); expect(before.exif).toBeDefined(); expect(before.icc).toBeDefined(); expect(before.xmp).toBeDefined(); expect(before.orientation).toBe(6);
  const result = await sanitizePhoto(original);
  expect(result).toMatchObject({ width: 320, height: 640 });
  const metadata = await sharp(result.bytes).metadata(); expect(metadata.format).toBe('jpeg'); expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined(); expect(metadata.xmp).toBeUndefined();
  expect((await sanitizePhoto(original)).bytes).toEqual(result.bytes);
});
it('rejects malformed/other-format/oversized/pixel-limited input and terminates cancelled/deadline children', async () => {
  await expect(sanitizePhoto(Buffer.from('invalid'))).rejects.toMatchObject({ code: 'invalid_photo' });
  await expect(sanitizePhoto(Buffer.from([255, 216, 1, 2]))).rejects.toMatchObject({ code: 'invalid_photo' });
  await expect(sanitizePhoto(Buffer.alloc(524289))).rejects.toMatchObject({ code: 'invalid_photo' });
  const large = await sharp({ create: { width: 2049, height: 32, channels: 3, background: '#537860' } }).jpeg().toBuffer(); await expect(sanitizePhoto(large)).rejects.toMatchObject({ code: 'invalid_photo' });
  const pixels = await sharp({ create: { width: 2000, height: 2001, channels: 3, background: '#537860' } }).jpeg().toBuffer(); await expect(sanitizePhoto(pixels)).rejects.toMatchObject({ code: 'invalid_photo' });
  const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#537860' } }).jpeg().toBuffer();
  const controller = new AbortController(); const pending = sanitizePhoto(small, { signal: controller.signal }); controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'photo_unavailable' });
  await expect(sanitizePhoto(small, { timeoutMs: 1 })).rejects.toMatchObject({ code: 'photo_unavailable' });
});

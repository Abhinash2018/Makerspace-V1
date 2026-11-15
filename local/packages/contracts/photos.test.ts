import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { internalPhotoRemovalSchema, photoConsentVersion, photoUploadSchema } from './photos.ts';

it('requires separate explicit versioned consent, opaque visit proof and canonical bounded bytes only', () => {
  const input = { visitId: randomUUID(), idempotencyKey: randomUUID(), consent: true, consentVersion: photoConsentVersion, image: Buffer.from([255, 216, 255, 217]).toString('base64') };
  expect(photoUploadSchema.parse(input)).toEqual(input);
  for (const value of [{ ...input, consent: false }, { ...input, consentVersion: 'old' }, { ...input, idempotencyKey: undefined }, { ...input, sessionScope: 'a'.repeat(64) }, { ...input, url: 'https://remote.invalid' }, { ...input, image: 'not base64' }, { ...input, image: Buffer.alloc(524289).toString('base64') }, { ...input, image: '/9j/2R==' }]) expect(photoUploadSchema.safeParse(value).success).toBe(false);
  expect(internalPhotoRemovalSchema.safeParse({ actor: 'staff', visitId: input.visitId, sessionScope: 'a'.repeat(64) }).success).toBe(false);
  expect(internalPhotoRemovalSchema.safeParse({ actor: 'visitor', visitId: input.visitId }).success).toBe(false);
});

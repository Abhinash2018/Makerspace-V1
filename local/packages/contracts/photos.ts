import { z } from 'zod';
import { requestIdSchema } from './index.ts';

export const photoConsentVersion = 'visit-photo-v1';
function base64(maximum: number) {
  return z.string().min(4).max(4 * Math.ceil(maximum / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine(value => { try { const decoded = atob(value); return decoded.length <= maximum && btoa(decoded) === value; } catch { return false; } });
}
export const photoParamsSchema = z.strictObject({ visitId: z.uuid().transform(value => value.toLowerCase()) });
export const visitPhotoProofSchema = photoParamsSchema.extend({ idempotencyKey: z.uuid().transform(value => value.toLowerCase()) });
export const photoUploadSchema = visitPhotoProofSchema.extend({ consent: z.literal(true), consentVersion: z.literal(photoConsentVersion), image: base64(524288) });
export const internalPhotoUploadSchema = photoUploadSchema.extend({ sessionScope: z.string().regex(/^[a-f0-9]{64}$/) });
export const internalPhotoRemovalSchema = z.discriminatedUnion('actor', [
  visitPhotoProofSchema.extend({ actor: z.literal('visitor'), sessionScope: z.string().regex(/^[a-f0-9]{64}$/) }),
  photoParamsSchema.extend({ actor: z.literal('staff') }),
]);
export const photoSavedSchema = z.strictObject({ requestId: requestIdSchema, visitId: z.uuid(), photoId: z.uuid(), saved: z.literal(true), replayed: z.boolean(), expiresAt: z.iso.datetime(), consentVersion: z.literal(photoConsentVersion) });
export const photoRemovedSchema = z.strictObject({ requestId: requestIdSchema, removed: z.literal(true), pendingCleanup: z.boolean() });
export const privatePhotoSchema = z.strictObject({ requestId: requestIdSchema, photoId: z.uuid(), visitId: z.uuid(), mime: z.literal('image/jpeg'),
  width: z.number().int().min(1).max(640), height: z.number().int().min(1).max(640), byteLength: z.number().int().min(4).max(262144), sha256: z.string().regex(/^[a-f0-9]{64}$/), image: base64(262144),
});
export type PhotoUpload = z.infer<typeof photoUploadSchema>;
export type InternalPhotoUpload = z.infer<typeof internalPhotoUploadSchema>;
export type PhotoRemoval = z.infer<typeof internalPhotoRemovalSchema>;
export type PhotoSaved = z.infer<typeof photoSavedSchema>;

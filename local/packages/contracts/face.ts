import { z } from 'zod';
import { requestIdSchema } from './index.ts';
import { displayNameSchema, netIdSchema } from './checkin.ts';
import { photoUploadSchema, visitPhotoProofSchema } from './photos.ts';

export const faceConsentVersion = 'face-matching-v1';
export const faceStatusSchema = z.strictObject({ requestId: requestIdSchema, enabled: z.boolean(), ready: z.boolean() });
export const scopeSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const faceProofSchema = visitPhotoProofSchema;
export const faceEnrollSchema = faceProofSchema.extend({ consent: z.literal(true), consentVersion: z.literal(faceConsentVersion), image: photoUploadSchema.shape.image });
export const internalEnrollSchema = faceEnrollSchema.extend({ sessionScope: scopeSchema });
export const faceMatchSchema = z.strictObject({ image: photoUploadSchema.shape.image, idempotencyKey: z.uuid().transform(value => value.toLowerCase()) });
export const internalMatchSchema = faceMatchSchema.extend({ sessionScope: scopeSchema });
export const faceCheckinSchema = z.strictObject({ ticket: z.string().min(40).max(2048).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/), idempotencyKey: z.uuid().transform(value => value.toLowerCase()) });
export const internalFaceCheckinSchema = faceCheckinSchema.extend({ sessionScope: scopeSchema });
export const faceIdentitySchema = z.strictObject({ requestId: requestIdSchema, name: displayNameSchema, netId: netIdSchema });
export const withdrawalCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const withdrawalInput = z.string().max(128);
export const faceWithdrawSchema = z.union([z.strictObject({ code: withdrawalInput }), faceProofSchema]);
export const internalWithdrawSchema = z.union([z.strictObject({ code: withdrawalInput }), faceProofSchema.extend({ sessionScope: scopeSchema })]);
export const faceEnrollmentSchema = z.strictObject({ requestId: requestIdSchema, enrollmentId: z.uuid(), expiresAt: z.iso.datetime(), withdrawalCode: withdrawalCodeSchema, consentVersion: z.literal(faceConsentVersion), replayed: z.boolean() });
export const faceRemovedSchema = z.strictObject({ requestId: requestIdSchema, removed: z.literal(true) });
export const faceMatchResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ requestId: requestIdSchema, status: z.literal('no_match') }),
  z.strictObject({ requestId: requestIdSchema, status: z.literal('matched'), ticket: faceCheckinSchema.shape.ticket, expiresAt: z.iso.datetime() }),
]);
export const faceListQuerySchema = z.strictObject({ after: z.uuid().transform(value => value.toLowerCase()).optional() });
export const faceListSchema = z.strictObject({ requestId: requestIdSchema, records: z.array(z.strictObject({ enrollmentId: z.uuid(), name: displayNameSchema, netId: netIdSchema, expiresAt: z.iso.datetime() })).max(25), next: z.uuid().nullable() });
export const faceTicketClaimsSchema = z.strictObject({ v: z.literal(1), aud: z.literal('makerspace-attendance'), enrollmentId: z.uuid(), generation: z.uuid(), namespace: scopeSchema, attempt: z.uuid(), nonce: z.uuid(), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() });

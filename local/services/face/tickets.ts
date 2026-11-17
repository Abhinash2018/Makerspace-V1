import { createHash, randomUUID } from 'node:crypto';
import { signFaceTicket, verifyFaceTicket } from '../../packages/http/face-ticket.ts';
import { FaceFailure } from './settings.ts';

export function createTicketStore(token: string, now = Date.now) {
  const issued = new Map<string, { ticket: string; imageDigest: string; expiresAt: number }>();
  const key = (scope: string, attempt: string) => `${scope}:${attempt}`;
  function sweep() { for (const [id, item] of issued) if (item.expiresAt <= now()) issued.delete(id); }
  return {
    prior(scope: string, attempt: string, image: Uint8Array) {
      sweep(); const previous = issued.get(key(scope, attempt));
      if (!previous) return null;
      if (previous.imageDigest !== createHash('sha256').update(image).digest('hex')) throw new FaceFailure('face_conflict');
      return { ticket: previous.ticket, expiresAt: new Date(previous.expiresAt).toISOString() };
    },
    issue(scope: string, attempt: string, image: Uint8Array, match: { enrollmentId: string; generation: string }) {
      sweep(); if (issued.size >= 512) throw new FaceFailure('rate_limited');
      const at = now(), expiresAt = at + 30000;
      const ticket = signFaceTicket(token, { v: 1, aud: 'makerspace-attendance', namespace: scope, attempt, ...match, nonce: randomUUID(), issuedAt: at, expiresAt });
      issued.set(key(scope, attempt), { ticket, imageDigest: createHash('sha256').update(image).digest('hex'), expiresAt });
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(ticket: string, scope: string, attempt: string) {
      sweep(); const claims = verifyFaceTicket(token, ticket, scope, attempt, now());
      if (issued.get(key(scope, attempt))?.ticket !== ticket) throw new FaceFailure('face_not_found');
      return claims;
    },
    clear() { issued.clear(); },
  };
}

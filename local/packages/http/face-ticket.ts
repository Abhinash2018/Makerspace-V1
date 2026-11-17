import { createHmac, timingSafeEqual } from 'node:crypto';
import { faceTicketClaimsSchema } from '../contracts/face.ts';

export type FaceClaims = ReturnType<typeof faceTicketClaimsSchema.parse>;
function signature(token: string, payload: string) {
  const key = createHmac('sha256', token).update('makerspace-face-attendance-v1').digest();
  return createHmac('sha256', key).update(payload).digest('base64url');
}
export function signFaceTicket(token: string, claims: FaceClaims) {
  const payload = Buffer.from(JSON.stringify(faceTicketClaimsSchema.parse(claims))).toString('base64url');
  return `${payload}.${signature(token, payload)}`;
}
export function verifyFaceTicket(token: string, ticket: string, namespace: string, attempt: string, at = Date.now()) {
  if (ticket.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error('face_not_found');
  const [payload, sig] = ticket.split('.') as [string, string];
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(signature(token, payload)))) throw new Error('face_not_found');
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.toString('base64url') !== payload) throw new Error('face_not_found');
  const claims = faceTicketClaimsSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (claims.namespace !== namespace || claims.attempt !== attempt || claims.expiresAt - claims.issuedAt !== 30000 || claims.issuedAt > at || claims.expiresAt <= at) throw new Error('face_not_found');
  return claims;
}

import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createTicketStore } from './tickets.ts';
import { verifyFaceTicket } from '../../packages/http/face-ticket.ts';
import { selectMatch, normalizeEmbedding } from './vectors.ts';
import { syntheticVector } from '../../tests/face-fixture.ts';

it('binds signed tickets to namespace/attempt/time/live process state and exact match capture', () => {
  let at = 100000;
  const token = 'b'.repeat(64), store = createTicketStore(token, () => at), scope = 'a'.repeat(64), attempt = randomUUID(), image = Buffer.from('synthetic capture');
  const match = { enrollmentId: randomUUID(), generation: randomUUID() }, issued = store.issue(scope, attempt, image, match);
  expect(store.consume(issued.ticket, scope, attempt)).toMatchObject(match);
  expect(store.prior(scope, attempt, image)).toEqual(issued);
  expect(() => store.prior(scope, attempt, Buffer.from('different'))).toThrow('face_conflict');
  expect(() => store.consume(issued.ticket, 'c'.repeat(64), attempt)).toThrow();
  expect(() => store.consume(issued.ticket, scope, randomUUID())).toThrow();
  expect(() => verifyFaceTicket('c'.repeat(64), issued.ticket, scope, attempt, at)).toThrow();
  expect(() => verifyFaceTicket(token, `A${issued.ticket.slice(1)}`, scope, attempt, at)).toThrow();
  expect(() => createTicketStore(token, () => at).consume(issued.ticket, scope, attempt)).toThrow();
  at += 30000; expect(() => store.consume(issued.ticket, scope, attempt)).toThrow(); expect(store.prior(scope, attempt, image)).toBe(null);
});
it('requires the conservative threshold plus separation and rejects invalid embeddings', () => {
  const probe = syntheticVector();
  const vector = (similarity: number) => [similarity, Math.sqrt(1 - similarity ** 2), ...Array<number>(126).fill(0)];
  expect(selectMatch(probe, [{ id: 'one', embedding: vector(0.649) }])).toBe(null);
  expect(selectMatch(probe, [{ id: 'one', embedding: vector(0.8) }, { id: 'two', embedding: vector(0.71) }])).toBe(null);
  expect(selectMatch(probe, [{ id: 'one', embedding: vector(0.8) }, { id: 'two', embedding: vector(0.69) }])).toBe('one');
  expect(() => normalizeEmbedding(Array<number>(128).fill(0))).toThrow(); expect(() => normalizeEmbedding([NaN])).toThrow();
});

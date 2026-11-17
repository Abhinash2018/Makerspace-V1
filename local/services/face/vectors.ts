import { FaceFailure } from './settings.ts';
export function normalizeEmbedding(values: readonly number[]) {
  if (values.length !== 128 || values.some(value => !Number.isFinite(value))) throw new FaceFailure('invalid_face');
  const norm = Math.hypot(...values);
  if (norm < 1e-8) throw new FaceFailure('invalid_face');
  return values.map(value => value / norm);
}
export function cosine(a: readonly number[], b: readonly number[]) { return a.reduce((sum, value, index) => sum + value * b[index]!, 0); }
export function selectMatch(probe: readonly number[], gallery: readonly { id: string; embedding: number[] }[]) {
  const ranked = gallery.map(item => ({ id: item.id, score: cosine(probe, item.embedding) })).sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= 0.65 && ranked[0].score - (ranked[1]?.score ?? -1) >= 0.10 ? ranked[0].id : null;
}

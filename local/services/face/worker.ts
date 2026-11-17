import { extractEmbedding } from './pipeline.ts';
import { FaceFailure } from './settings.ts';
if (!process.send) throw new Error('Face worker only.');
process.once('disconnect', () => process.exit(1));
process.once('message', async (value: { directory: string; bytes: Uint8Array }) => {
  try { const embedding = await extractEmbedding(value.directory, value.bytes); process.send!({ embedding }, () => process.exit(0)); }
  catch (error) { process.send!({ error: error instanceof FaceFailure ? error.code : 'face_unavailable' }, () => process.exit(1)); }
});

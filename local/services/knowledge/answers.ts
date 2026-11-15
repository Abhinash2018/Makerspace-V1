import { answerDisclaimer, questionSchema, type AnswerResponse } from '../../packages/contracts/answers.ts';
import { currentDocuments, CorpusFailure, type EvidenceChunk } from './repository.ts';
import { overlaps, retrieveEvidence } from './retrieval.ts';
import { questionTerms } from './retrieval.ts';
import { selectQuotes, type quoteSelectionSchema } from './chat.ts';
import type { z } from 'zod';
import { loadEmbeddingSettings } from './settings.ts';
import { inspectModel } from './ollama.ts';
import { ChatFailure } from './chat.ts';

type Answer = Omit<Extract<AnswerResponse, { status: 'answered' }>, 'requestId'> | Omit<Extract<AnswerResponse, { status: 'uncertain' }>, 'requestId'>;
export const uncertain = (reason: Extract<AnswerResponse, { status: 'uncertain' }>['reason']): Answer => ({ status: 'uncertain', reason, excerpts: [], disclaimer: answerDisclaimer });
function completeExcerpt(source: string, quote: string) {
  const position = source.indexOf(quote);
  return position >= 0 && (position === 0 || /[.!?]$/.test(source.slice(0, position).trimEnd()))
    && (position + quote.length === source.length || /[.!?]$/.test(quote));
}
function supportsQuantity(question: string, quote: string) {
  if (!/\b(how (many|much|long)|number of|duration|(?:what|which)(?: is| are)?(?: the)? (?:cost|price|fee))\b/i.test(question)) return true;
  const amount = /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|noon|midnight)\b/i.test(quote);
  const cues = new Set(['many', 'much', 'long', 'number', 'duration', 'required', 'require', 'need', 'needed', 'cost', 'price', 'fee']);
  const subjects = questionTerms(question).filter(word => !cues.has(word));
  const words = new Set(quote.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return amount && subjects.length > 0 && subjects.every(word => words.has(word));
}
export function validateQuotes(question: string, quotes: z.infer<typeof quoteSelectionSchema>, evidence: readonly EvidenceChunk[]): Answer {
  if (!quotes.quotes.length || new Set(quotes.quotes.map(quote => quote.source)).size !== quotes.quotes.length) return uncertain('unsupported_output');
  const excerpts: Extract<AnswerResponse, { status: 'answered' }>['excerpts'] = [];
  for (const quote of quotes.quotes) {
    const chunk = evidence[Number(quote.source.slice(1)) - 1];
    if (!chunk || quote.text !== quote.text.trim() || !completeExcerpt(chunk.text, quote.text) || !overlaps(question, quote.text) || !supportsQuantity(question, quote.text)) return uncertain('unsupported_output');
    excerpts.push({ text: quote.text, citation: { chunkId: chunk.chunkId, documentKey: chunk.document.key, title: chunk.document.title,
      version: chunk.document.version, sourceHash: chunk.document.sourceHash, page: chunk.page } });
  }
  return { status: 'answered', excerpts, disclaimer: answerDisclaimer };
}
export class AnswerBusy extends Error { constructor() { super('busy'); } }
export function createAnswerEngine(context: { directory: string; baseUrl: string; model: string | null }) {
  const settings = loadEmbeddingSettings(context.directory);
  let active = false;
  return async (input: unknown, cancellation?: AbortSignal): Promise<Answer> => {
    const { question } = questionSchema.parse(input);
    if (active) throw new AnswerBusy();
    active = true;
    const deadline = AbortSignal.timeout(90000), signal = cancellation ? AbortSignal.any([deadline, cancellation]) : deadline;
    try {
      signal.throwIfAborted();
      const { identity, evidence } = await retrieveEvidence({ ...context, settings }, question, signal);
      if (!evidence.length) return uncertain('no_evidence');
      const selected = await selectQuotes(context, question, evidence, signal);
      signal.throwIfAborted();
      if (!selected.selection.success) return uncertain('unsupported_output');
      const model = await inspectModel({ baseUrl: context.baseUrl, model: settings.model }, { signal });
      if (model.code !== 'ready' || model.model !== identity.model || model.digest?.toLowerCase() !== identity.digest) throw new ChatFailure();
      const current = currentDocuments(context.directory);
      if (evidence.some(chunk => !current.some(document => document.key === chunk.document.key && document.version === chunk.document.version && document.sourceHash === chunk.document.sourceHash))) return uncertain('index_unavailable');
      return validateQuotes(question, selected.selection.data, evidence);
    } catch (error) {
      if (error instanceof CorpusFailure && ['index_incomplete', 'index_incompatible'].includes(error.code)) return uncertain('index_unavailable');
      throw new ChatFailure();
    } finally { active = false; }
  };
}

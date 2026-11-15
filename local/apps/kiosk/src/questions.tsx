import { useEffect, useRef, useState } from 'react';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { answerResponseSchema, questionSchema, type AnswerResponse } from '../../../packages/contracts/answers.ts';

export function QuestionForm({ session, onFinish, onSessionInvalid }: { session: BrowserSession; onFinish: () => void; onSessionInvalid: () => void }) {
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const input = useRef<HTMLTextAreaElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const controller = useRef<AbortController | null>(null), epoch = useRef(0), submitting = useRef(false), active = useRef(true);
  useEffect(() => { input.current?.focus(); return () => { active.current = false; epoch.current++; controller.current?.abort(); }; }, []);
  useEffect(() => { if (result) heading.current?.focus(); else if (!busy) input.current?.focus(); }, [result, busy]);
  function clear(cancelled = false) {
    epoch.current++; controller.current?.abort(); controller.current = null; submitting.current = false;
    setQuestion(''); setResult(null); setBusy(false); setMessage(cancelled ? 'Question cancelled and cleared.' : '');
  }
  async function submit() {
    if (submitting.current) return;
    const parsed = questionSchema.safeParse({ question });
    if (!parsed.success) { setMessage('Enter a question of up to 500 characters without personal information.'); input.current?.focus(); return; }
    const request = ++epoch.current; submitting.current = true; setBusy(true); setMessage(''); setResult(null);
    controller.current = new AbortController();
    try {
      const response = await fetch('/api/v1/question', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(100000)]),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(parsed.data),
      });
      if (!active.current || request !== epoch.current) return;
      if (response.status === 401 || response.status === 403) { clear(); onSessionInvalid(); return; }
      if (!response.ok) {
        setQuestion(''); setMessage(response.status === 429 ? 'Document answers are busy. Wait a moment, then ask again.' : 'Document answers are unavailable. Please ask Makerspace staff.'); return;
      }
      const answer = answerResponseSchema.parse(await response.json());
      if (active.current && request === epoch.current) { setQuestion(''); setResult(answer); }
    } catch {
      if (active.current && request === epoch.current) { setQuestion(''); setMessage('Document answers are unavailable. Please ask Makerspace staff.'); }
    } finally {
      if (active.current && request === epoch.current) { submitting.current = false; setBusy(false); controller.current = null; }
    }
  }
  return <section className="question-form" aria-labelledby="question-title">
    <h2 id="question-title" ref={heading} tabIndex={-1}>{result ? 'Approved document evidence' : 'Ask a question'}</h2>
    {result ? <div aria-live="polite">
      {result.status === 'answered' ? <><p>These excerpts come from approved local documents. Staff can help interpret them.</p>{result.excerpts.map(excerpt => <figure key={excerpt.citation.chunkId}>
        <blockquote>{excerpt.text}</blockquote><figcaption>{excerpt.citation.title} — version {excerpt.citation.version}, page {excerpt.citation.page}</figcaption>
      </figure>)}</> : <p>I couldn’t find enough approved evidence to answer. Please ask Makerspace staff.</p>}
      <p className="note">{result.disclaimer}</p>
      <button className="back" type="button" onClick={() => clear()}>Ask another question</button>
    </div> : <form autoComplete="off" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <p>Ask about approved workshop documents. Don’t enter names, NetIDs or other personal information.</p>
      <label htmlFor="visitor-question">Your question</label>
      <textarea id="visitor-question" ref={input} value={question} onChange={event => setQuestion(event.target.value)} maxLength={500} autoComplete="off" required readOnly={busy} aria-describedby="question-guidance" />
      <p id="question-guidance" className="note">Up to 500 characters. Questions and answers clear when you leave this screen.</p>
      <button className="back" type="submit" disabled={busy}>{busy ? 'Checking approved documents…' : 'Find document evidence'}</button>
      {busy && <button className="back" type="button" onClick={() => clear(true)}>Cancel and clear</button>}
    </form>}
    {message && <p className="access-message" role="status">{message}</p>}
    <button className="back" type="button" onClick={() => { clear(); onFinish(); }}>Back to welcome</button>
  </section>;
}

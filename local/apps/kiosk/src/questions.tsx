import { useEffect, useRef, useState } from 'react';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { chatRequestSchema, chatResponseSchema, type ChatRequest, type ChatResponse } from '../../../packages/contracts/chat.ts';

type Turn = { question: string; answer?: ChatResponse; error?: string };
const uncertainText = 'I couldn’t find enough information in the supplied PDFs to answer that. Try asking about Makerspace access, equipment, training or policies, or ask Makerspace staff.';
const answerText = (answer: ChatResponse) => answer.status === 'answered' ? answer.sections.map(section => section.text).join('\n\n') : uncertainText;
function history(turns: Turn[]): ChatRequest['history'] {
  const result: ChatRequest['history'] = [];
  for (const turn of turns.filter(turn => turn.answer).slice(-3)) {
    result.push({ role: 'user', content: turn.question }, { role: 'assistant', content: answerText(turn.answer!) });
  }
  while (new TextEncoder().encode(result.map(item => item.content).join('')).length > 10000) result.splice(0, 2);
  return result;
}
export function QuestionForm({ session, onFinish, onSessionInvalid }: { session: BrowserSession; onFinish: () => void; onSessionInvalid: () => void }) {
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const input = useRef<HTMLTextAreaElement>(null), latest = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null), epoch = useRef(0), submitting = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; input.current?.focus(); return () => { active.current = false; epoch.current++; controller.current?.abort(); }; }, []);
  useEffect(() => { latest.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [turns, busy]);
  useEffect(() => { if (!busy) input.current?.focus(); }, [busy]);
  function clear() {
    epoch.current++; controller.current?.abort(); controller.current = null; submitting.current = false;
    setQuestion(''); setTurns([]); setBusy(false); setMessage(''); input.current?.focus();
  }
  function stop() {
    epoch.current++; controller.current?.abort(); controller.current = null; submitting.current = false; setBusy(false);
    setTurns(items => items.map((turn, index) => index === items.length - 1 && !turn.answer ? { ...turn, error: 'Response stopped. You can retry this question.' } : turn));
  }
  async function submit(retry = false) {
    if (submitting.current) return;
    const prior = (retry ? turns.slice(0, -1) : turns).slice(-11);
    const parsed = chatRequestSchema.safeParse({ question: retry ? turns.at(-1)?.question : question, history: history(prior) });
    if (!parsed.success) { setMessage('Enter a question of up to 500 characters without personal information.'); input.current?.focus(); return; }
    const request = ++epoch.current; submitting.current = true; setBusy(true); setMessage(''); setQuestion('');
    setTurns([...prior, { question: parsed.data.question }]);
    controller.current = new AbortController();
    try {
      const response = await fetch('/api/v1/chat', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(120000)]),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(parsed.data) });
      if (!active.current || request !== epoch.current) return;
      if (response.status === 401 || response.status === 403) { clear(); onSessionInvalid(); return; }
      if (!response.ok) throw new Error(response.status === 429 ? 'The local assistant is busy. Wait a moment, then retry.' : 'The local assistant is unavailable. Please retry or ask Makerspace staff.');
      const answer = chatResponseSchema.parse(await response.json());
      if (active.current && request === epoch.current) setTurns([...prior, { question: parsed.data.question, answer }]);
    } catch (error) {
      if (active.current && request === epoch.current) setTurns([...prior, { question: parsed.data.question, error: error instanceof Error && error.message.startsWith('The local assistant') ? error.message : 'The local assistant is unavailable. Please retry or ask Makerspace staff.' }]);
    } finally { if (active.current && request === epoch.current) { submitting.current = false; setBusy(false); controller.current = null; } }
  }
  return <section className="chat" aria-labelledby="question-title">
    <div className="chat-heading"><div><p className="eyebrow">YOUR LOCAL PDF ASSISTANT</p><h2 id="question-title">Ask Makerspace</h2></div><button className="back" type="button" onClick={clear}>New chat</button></div>
    <p className="note">Answers from the supplied Makerspace PDFs. Don’t enter names, NetIDs or other personal information. This conversation clears when you leave.</p>
    <div className="chat-thread" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
      {!turns.length && <div className="chat-empty"><h3>What would you like to know?</h3><p>I can help explain equipment access, training, policies and procedures.</p><div className="chat-suggestions">{['How do I access a 3D printer?', 'What training do I need?', 'Can I bring my own filament?'].map(prompt => <button type="button" key={prompt} onClick={() => { setQuestion(prompt); input.current?.focus(); }}>{prompt}</button>)}</div></div>}
      {turns.map((turn, index) => <div className="chat-turn" key={index}>
        <div className="chat-user"><span className="chat-speaker">You</span><p>{turn.question}</p></div>
        <div className="chat-assistant"><span className="chat-speaker">Makerspace assistant</span>
          {turn.answer ? <>{turn.answer.status === 'answered' ? turn.answer.sections.map((section, sectionIndex) => <div key={sectionIndex} className="chat-section"><p>{section.text}</p><details><summary>Sources · {section.sources.map(source => `${source.citation.title}, p. ${source.citation.page}`).join('; ')}</summary>{section.sources.map(source => <figure key={source.citation.chunkId}><blockquote>{source.quote}</blockquote><figcaption>{source.citation.title} — page {source.citation.page}, version {source.citation.version}</figcaption></figure>)}</details></div>) : <p>{uncertainText}</p>}<p className="note">{turn.answer.disclaimer}</p></> : turn.error ? <><p role="status">{turn.error}</p>{index === turns.length - 1 && !busy && <button className="back" type="button" onClick={() => void submit(true)}>Retry question</button>}</> : <p className="chat-thinking">Reading the PDFs and writing an answer…</p>}
        </div>
      </div>)}<div ref={latest} />
    </div>
    <form className="chat-composer" autoComplete="off" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <label htmlFor="visitor-question">Your question</label>
      <textarea id="visitor-question" ref={input} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void submit(); } }} maxLength={500} autoComplete="off" placeholder="Ask a question or follow up…" rows={2} aria-describedby="question-guidance" />
      <div className="chat-composer-bottom"><p id="question-guidance" className="note">Enter to send · Shift+Enter for a new line · {question.length}/500</p>{busy ? <button className="back" type="button" onClick={stop}>Stop response</button> : <button className="begin" type="submit" disabled={!question.trim()}>Send <span aria-hidden="true">↑</span></button>}</div>
    </form>
    {message && <p className="access-message" role="status">{message}</p>}
    <button className="back" type="button" onClick={() => { clear(); onFinish(); }}>Back to welcome</button>
  </section>;
}

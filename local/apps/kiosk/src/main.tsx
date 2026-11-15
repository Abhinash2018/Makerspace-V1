import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { systemStatusSchema } from '../../../packages/contracts/index.ts';
import type { SystemStatus } from '../../../packages/contracts/index.ts';
import { StaffAccess, useAccess } from './access.tsx';
import { CheckinForm } from './checkin.tsx';
import { QuestionForm } from './questions.tsx';
import { StaffHistory } from './history.tsx';
import './style.css';

const labels = { gateway: 'Kiosk gateway', attendance: 'Attendance service', knowledge: 'Knowledge service', ollama: 'Local AI model' };
const explanations: Record<string, string> = {
  ready: 'Ready', model_not_configured: 'Model not configured', model_missing: 'Model not installed',
  runtime_unavailable: 'Runtime offline', timeout: 'Response timed out', dependency_unavailable: 'Service unavailable',
  ui_missing: 'Kiosk build missing', db_unavailable: 'Database unavailable', migrations_required: 'Migration required',
};
function App() {
  const access = useAccess();
  const [begun, setBegun] = useState(false);
  const [screen, setScreen] = useState<'choices' | 'checkin' | 'question'>('choices');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (access.session?.role !== 'kiosk') { setBegun(false); setScreen('choices'); } }, [access.session?.role]);
  useEffect(() => {
    if (begun) heading.current?.focus();
  }, [begun]);
  useEffect(() => {
    const lifetime = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch('/api/v1/system/status', { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(3500)]), cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error('Unavailable');
        const value = systemStatusSchema.parse(await response.json());
        if (!lifetime.signal.aborted) { setStatus(value); setOffline(false); }
      } catch { if (!lifetime.signal.aborted) { setStatus(null); setOffline(true); } }
      if (!lifetime.signal.aborted) timer = setTimeout(() => { void poll(); }, 5000);
    }
    void poll();
    return () => { lifetime.abort(); clearTimeout(timer); };
  }, []);
  const summary = offline ? 'Gateway unavailable' : !status ? 'Checking local services…' : status.state === 'ready' ? 'Local services ready' : status.state === 'degraded' ? 'Local AI needs attention' : 'Some services unavailable';
  return <main>
    <header><div className="mark" aria-hidden="true">M</div><div><strong>INGRAM</strong><span>MAKERSPACE</span></div><span className="local">ON THIS DEVICE</span></header>
    <div className="layout">
      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">A SPACE FOR WHAT’S NEXT</p>
        <h1 id="welcome-title">Ideas start<br />with <em>you.</em></h1>
        <p className="intro">Welcome to Ingram Makerspace. Get ready to learn, build, and bring something new to life.</p>
        <p className="assistant-name">Ingram Makerspace Assistant</p>
        {access.session?.role === 'staff' ? <section aria-label="Staff workspace">
          {!access.busy && <StaffHistory key={access.session.csrfToken} session={access.session} onSessionInvalid={access.invalidate} />}
          <p className="note">Begin signs staff out and starts a new visitor session.</p>
          <button className="begin" disabled={access.busy} onClick={async () => { if (await access.begin()) { setScreen('choices'); setBegun(true); } }}>Begin <span aria-hidden="true">↗</span></button>
        </section> : !begun ? <button className="begin" disabled={access.busy} onClick={async () => { if (await access.begin()) { setScreen('choices'); setBegun(true); } }}>Begin <span aria-hidden="true">↗</span></button> : screen === 'checkin' && access.session?.role === 'kiosk' ? <CheckinForm key={access.session.csrfToken} session={access.session} onSessionInvalid={access.invalidate} onFinish={() => { setScreen('choices'); setBegun(false); void access.begin(); }} /> : screen === 'question' && access.session?.role === 'kiosk' ? <QuestionForm key={access.session.csrfToken} session={access.session} onSessionInvalid={access.invalidate} onFinish={() => { setScreen('choices'); setBegun(false); void access.begin(); }} /> : <section className="choices" aria-labelledby="choices-title">
          <h2 id="choices-title" ref={heading} tabIndex={-1}>What would you like to do?</h2>
          <div className="actions"><button disabled={access.busy || access.session?.role !== 'kiosk'} onClick={() => setScreen('checkin')}>Check in<span>Self-reported visit</span></button><button disabled={access.busy || access.session?.role !== 'kiosk'} onClick={() => setScreen('question')}>Ask a question<span>Approved document evidence</span></button></div>
          <p>Check in, look up approved document evidence, or speak with Makerspace staff for help.</p>
          <button className="back" disabled={access.busy} onClick={async () => { if (await access.begin()) { setScreen('choices'); setBegun(false); } }}>Back to welcome</button>
        </section>}
      </section>
      <aside aria-labelledby="status-title">
        <div className="panel-heading"><p className="eyebrow">FOUNDATION PREVIEW</p><span aria-hidden="true">◈</span></div>
        <h2 id="status-title">System status</h2>
        <p className="summary" role="status" aria-live="polite">{summary}</p>
        <ul>{Object.entries(labels).map(([key, label]) => {
          const item = status?.components[key as keyof typeof labels];
          return <li key={key}><span className={`dot ${item?.ready ? 'ready' : ''}`} aria-hidden="true" /><div><strong>{label}</strong><span>{offline ? 'Unknown — gateway offline' : !item ? 'Checking…' : explanations[item.code] ?? 'Needs attention'}</span></div></li>;
        })}</ul>
        <p className="note">Manual check-in records self-reported information locally. Document evidence does not replace staff guidance.</p>
        <StaffAccess access={access} />
      </aside>
    </div>
    <footer><span>MAKE SOMETHING THAT MATTERS.</span><span>Camera & microphone off</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);

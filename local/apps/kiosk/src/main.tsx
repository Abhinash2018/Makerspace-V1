import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { systemStatusSchema } from '../../../packages/contracts/index.ts';
import type { SystemStatus } from '../../../packages/contracts/index.ts';
import './style.css';

const labels = { gateway: 'Kiosk gateway', attendance: 'Attendance service', knowledge: 'Knowledge service', ollama: 'Local AI model' };
const explanations: Record<string, string> = {
  ready: 'Ready', model_not_configured: 'Model not configured', model_missing: 'Model not installed',
  runtime_unavailable: 'Runtime offline', timeout: 'Response timed out', dependency_unavailable: 'Service unavailable',
  ui_missing: 'Kiosk build missing', db_unavailable: 'Database unavailable', migrations_required: 'Migration required',
};
function App() {
  const [begun, setBegun] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
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
        {!begun ? <button className="begin" onClick={() => setBegun(true)}>Begin <span aria-hidden="true">↗</span></button> : <section className="choices" aria-labelledby="choices-title">
          <h2 id="choices-title" ref={heading} tabIndex={-1}>What would you like to do?</h2>
          <div className="actions"><button disabled>Check in<span>Coming soon</span></button><button disabled>Ask a question<span>Coming soon</span></button></div>
          <p>We’re setting things up. For help today, please speak with Makerspace staff.</p>
          <button className="back" onClick={() => setBegun(false)}>Back to welcome</button>
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
        <p className="note">Check-in and questions are upcoming features. This preview does not collect visitor information.</p>
      </aside>
    </div>
    <footer><span>MAKE SOMETHING THAT MATTERS.</span><span>Camera & microphone off</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);

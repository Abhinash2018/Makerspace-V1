import { useEffect, useRef, useState } from 'react';
import { checkinRequestSchema, checkinResponseSchema } from '../../../packages/contracts/checkin.ts';
import type { CheckinRequest, CheckinResponse } from '../../../packages/contracts/checkin.ts';
import { errorSchema } from '../../../packages/contracts/index.ts';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { VisitPhoto } from './photos.tsx';

export function CheckinForm({ session, onFinish, onSessionInvalid, onCameraChange }: {
  session: BrowserSession; onFinish: () => void; onSessionInvalid: () => void; onCameraChange: (live: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [invalidField, setInvalidField] = useState<'name' | 'netId' | null>(null);
  const [receipt, setReceipt] = useState<CheckinResponse | null>(null);
  const [photoKey, setPhotoKey] = useState('');
  const form = useRef<HTMLFormElement>(null), name = useRef<HTMLInputElement>(null), title = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<CheckinRequest | null>(null), controller = useRef<AbortController | null>(null), active = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { name.current?.focus(); return () => { active.current = false; controller.current?.abort(); attempt.current = null; }; }, []);
  useEffect(() => { if (receipt) title.current?.focus(); }, [receipt]);
  useEffect(() => { if (!busy && !locked && !receipt) name.current?.focus(); }, [busy, locked, receipt]);
  function startOver() { attempt.current = null; form.current?.reset(); setLocked(false); setMessage(''); setInvalidField(null); }
  async function submit() {
    if (submitting.current) return;
    if (!attempt.current) {
      const fields = new FormData(form.current!);
      const parsed = checkinRequestSchema.safeParse({ name: fields.get('name'), netId: fields.get('netId'), idempotencyKey: crypto.randomUUID() });
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0] === 'netId' ? 'netId' : 'name';
        setInvalidField(field); setMessage('Enter a name of up to 100 characters and a NetID of 2–32 letters/digits beginning with a letter.');
        (field === 'netId' ? form.current?.querySelector<HTMLInputElement>('#visitor-netid') : name.current)?.focus(); return;
      }
      attempt.current = parsed.data;
    }
    submitting.current = true; setBusy(true); setLocked(true); setMessage(''); setInvalidField(null);
    controller.current = new AbortController();
    try {
      const response = await fetch('/api/v1/checkin', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(5000)]),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(attempt.current),
      });
      const body: unknown = await response.json();
      if (!active.current) return;
      if (response.ok) {
        const saved = checkinResponseSchema.parse(body);
        setPhotoKey(attempt.current!.idempotencyKey);
        attempt.current = null; form.current?.reset(); setReceipt(saved);
      } else {
        const error = errorSchema.safeParse(body);
        if (response.status === 401 || response.status === 403) { onSessionInvalid(); return; }
        if (response.status === 400) { attempt.current = null; setLocked(false); setMessage('The details were not accepted. Check the name and NetID, then try again.'); }
        else if (error.success && error.data.error.code === 'idempotency_conflict') setMessage('This attempt was already used with different details. Start a new attempt if another visit is intended.');
        else if (response.status === 429) setMessage('Too many attempts. Wait a minute, then retry this same check-in.');
        else setMessage('Check-in could not be confirmed. It may have been saved. Retry this same check-in to confirm it.');
      }
    } catch {
      if (active.current) setMessage('Check-in could not be confirmed. It may have been saved. Retry this same check-in to confirm it.');
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }
  if (receipt) return <section className="checkin" aria-labelledby="checkin-saved-title">
    <h2 id="checkin-saved-title" ref={title} tabIndex={-1}>Check-in recorded</h2>
    <p>Your visit was saved. Identity is self-reported.</p>
    <p><time dateTime={receipt.recordedAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(receipt.recordedAt))}</time> (Central time)</p>
    <VisitPhoto session={session} visitId={receipt.visitId} idempotencyKey={photoKey} onSessionInvalid={onSessionInvalid} onCameraChange={onCameraChange} />
    <button className="back" onClick={onFinish}>Finish</button>
  </section>;
  return <form className="checkin" ref={form} autoComplete="off" onChange={() => { if (!locked && invalidField) { setInvalidField(null); setMessage(''); } }} onSubmit={event => { event.preventDefault(); void submit(); }} aria-labelledby="checkin-title">
    <h2 id="checkin-title">Manual check-in</h2>
    <p>Identity is self-reported and is not verified by the university. Visits follow a 30-day retention period.</p>
    <label htmlFor="visitor-name">Name</label>
    <input id="visitor-name" name="name" ref={name} maxLength={256} autoComplete="off" required readOnly={locked} aria-invalid={invalidField === 'name'} aria-describedby={message ? 'checkin-feedback' : undefined} />
    <label htmlFor="visitor-netid">NetID</label>
    <input id="visitor-netid" name="netId" maxLength={64} autoComplete="off" spellCheck={false} autoCapitalize="none" required readOnly={locked} aria-invalid={invalidField === 'netId'} aria-describedby={message ? 'checkin-feedback' : undefined} />
    {message && <p className="access-message" id="checkin-feedback" role="alert">{message}</p>}
    {locked && !busy && <p className="note">Keep the same attempt to avoid a duplicate. Starting over may record another visit if the earlier request succeeded.</p>}
    <div className="checkin-controls">
      <button className="back" type="submit" disabled={busy}>{busy ? 'Confirming…' : locked ? 'Retry same check-in' : 'Record check-in'}</button>
      {locked && <button className="back" type="button" disabled={busy} onClick={startOver}>Start a new attempt</button>}
      <button className="back" type="button" disabled={busy} onClick={onFinish}>Back to welcome</button>
    </div>
  </form>;
}

import { useEffect, useRef, useState } from 'react';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { photoConsentVersion, photoRemovedSchema, photoSavedSchema, photoUploadSchema } from '../../../packages/contracts/photos.ts';

export function VisitPhoto({ session, visitId, idempotencyKey, onSessionInvalid, onCameraChange }: {
  session: BrowserSession; visitId: string; idempotencyKey: string; onSessionInvalid: () => void; onCameraChange: (live: boolean) => void;
}) {
  const [mode, setMode] = useState<'closed' | 'consent' | 'starting' | 'live' | 'preview' | 'saved' | 'removed'>('closed');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null);
  const image = useRef(''), attempted = useRef(false), active = useRef(true), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const camera = useRef(onCameraChange), invalid = useRef(onSessionInvalid);
  camera.current = onCameraChange; invalid.current = onSessionInvalid;
  function stop() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; camera.current(false); }
  function clear() { image.current = ''; if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } }
  useEffect(() => () => { active.current = false; epoch.current++; controller.current?.abort(); stop(); clear(); }, []);
  async function start() {
    if (!consent || busy) return;
    const request = ++epoch.current; clear(); stop(); setMessage(''); setMode('starting');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!active.current || request !== epoch.current) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired; camera.current(true);
      if (!video.current) throw new Error('Camera unavailable');
      video.current.srcObject = acquired; await video.current.play();
      if (active.current && request === epoch.current) setMode('live');
    } catch {
      if (active.current && request === epoch.current) { stop(); setMode('consent'); setMessage('Camera unavailable or permission denied. Your visit is already recorded; you can skip the photo.'); }
    }
  }
  function capture() {
    try {
      const source = video.current!, target = canvas.current!;
      if (!source.videoWidth || !source.videoHeight) throw new Error('No frame');
      const ratio = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
      target.width = Math.round(source.videoWidth * ratio); target.height = Math.round(source.videoHeight * ratio);
      const context = target.getContext('2d'); if (!context) throw new Error('No canvas');
      context.drawImage(source, 0, 0, target.width, target.height);
      image.current = target.toDataURL('image/jpeg', .8).split(',')[1] ?? '';
      photoUploadSchema.parse({ visitId, idempotencyKey, consent: true, consentVersion: photoConsentVersion, image: image.current });
      stop(); setMode('preview');
    } catch { stop(); clear(); setMode('consent'); setMessage('Photo capture failed. You can try again or skip; your visit is recorded.'); }
  }
  async function send(remove: boolean) {
    if (busy) return;
    const request = ++epoch.current; controller.current?.abort(); controller.current = new AbortController(); stop(); setBusy(true); setMessage('');
    if (!remove) attempted.current = true;
    try {
      const response = await fetch(remove ? '/api/v1/visit-photo/remove' : '/api/v1/visit-photo', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(10000)]),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify(remove ? { visitId, idempotencyKey } : { visitId, idempotencyKey, consent: true, consentVersion: photoConsentVersion, image: image.current }),
      });
      if (!active.current || request !== epoch.current) return;
      if (response.status === 401 || response.status === 403) { clear(); invalid.current(); return; }
      if (!response.ok) throw new Error('Photo unavailable');
      const body: unknown = await response.json();
      if (!active.current || request !== epoch.current) return;
      if (remove) { photoRemovedSchema.parse(body); setMode('removed'); }
      else { const saved = photoSavedSchema.parse(body); if (saved.visitId !== visitId) throw new Error('Invalid photo'); setMode('saved'); }
      clear();
    } catch {
      if (active.current && request === epoch.current) setMessage(remove ? 'Removal could not be confirmed. Retry withdrawal or ask staff to remove the photo.' : 'Photo save could not be confirmed. Retry the same photo or withdraw consent. Your visit is already recorded.');
    } finally { if (active.current && request === epoch.current) setBusy(false); }
  }
  function skip() { epoch.current++; controller.current?.abort(); stop(); clear(); setConsent(false); setMessage(''); setMode('closed'); }
  return <section className="visit-photo" aria-label="Optional visit photo" aria-busy={busy}>
    {mode === 'closed' ? <button className="back" onClick={() => setMode('consent')}>Add optional photo</button> : mode === 'removed' ? <p role="status">Photo consent withdrawn. This visit cannot receive another photo.</p> : mode === 'saved' ? <><p role="status">Optional photo saved privately with your visit.</p><button className="back" disabled={busy} onClick={() => { void send(true); }}>Remove photo and withdraw consent</button></> : <>
      <h3>Optional visit photo</h3>
      <p>A photo is optional. Staff can view it privately for up to 30 days from your visit. It is not used for face enrollment or AI answers. You can withdraw consent here or ask staff later.</p>
      <label className="photo-consent"><input type="checkbox" checked={consent} disabled={mode !== 'consent'} onChange={event => setConsent(event.target.checked)} />I consent to saving an optional visit photo.</label>
      {mode === 'consent' && <button className="back" disabled={!consent} onClick={() => { void start(); }}>Start camera</button>}
      {mode === 'starting' && <p role="status">Waiting for camera permission… You can cancel without waiting.</p>}
      {mode === 'live' && <button className="back" onClick={capture}>Capture photo</button>}
      {mode === 'preview' && <div className="photo-controls"><button className="back" disabled={busy} onClick={() => { void send(false); }}>{busy ? 'Saving…' : attempted.current ? 'Retry same photo' : 'Save photo'}</button>{!attempted.current && <button className="back" disabled={busy} onClick={() => { void start(); }}>Retake photo</button>}</div>}
      {attempted.current ? <button className="back" disabled={busy} onClick={() => { void send(true); }}>Withdraw photo consent</button> : <button className="back" onClick={skip}>Skip photo</button>}
    </>}
    <video ref={video} hidden={mode !== 'live' && mode !== 'starting'} muted playsInline aria-label="Live camera preview" />
    <canvas ref={canvas} hidden={mode !== 'preview'} role="img" aria-label="Captured photo preview" />
    {message && <p className="access-message" role="alert">{message}</p>}
    {attempted.current && mode !== 'removed' && mode !== 'saved' && <p className="note">Finishing does not confirm cancellation of a submitted photo. Use withdrawal or ask staff if its save is uncertain.</p>}
  </section>;
}

export function StaffPhoto({ session, visitId, onSessionInvalid, onRemoved }: { session: BrowserSession; visitId: string; onSessionInvalid: () => void; onRemoved: () => void }) {
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), active = useRef(true), controller = useRef<AbortController | null>(null), epoch = useRef(0);
  function clear() { if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } }
  useEffect(() => () => { active.current = false; epoch.current++; controller.current?.abort(); clear(); }, []);
  function hide() { epoch.current++; controller.current?.abort(); clear(); setVisible(false); setBusy(false); setMessage(''); }
  async function request(remove: boolean) {
    if (busy) return;
    const version = ++epoch.current; controller.current = new AbortController(); setBusy(true); setMessage('');
    const current = () => active.current && version === epoch.current;
    try {
      const response = await fetch(`/api/v1/staff/visits/${visitId}/photo`, { method: remove ? 'DELETE' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(3500)]),
        ...(remove ? { headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' } : {}),
      });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { clear(); onSessionInvalid(); return; }
      if (!response.ok) throw new Error('Photo unavailable');
      if (remove) { photoRemovedSchema.parse(await response.json()); if (current()) { clear(); onRemoved(); } return; }
      if (response.headers.get('content-type') !== 'image/jpeg') throw new Error('Invalid image');
      const blob = await response.blob(); if (!current()) return;
      if (blob.size > 262144) throw new Error('Invalid image');
      const bitmap = await createImageBitmap(blob);
      try {
        if (!current()) return;
        if (bitmap.width > 640 || bitmap.height > 640) throw new Error('Invalid dimensions');
        const target = canvas.current!; target.width = bitmap.width; target.height = bitmap.height;
        const context = target.getContext('2d'); if (!context) throw new Error('No canvas');
        context.drawImage(bitmap, 0, 0); setVisible(true);
      } finally { bitmap.close(); }
    } catch { if (current()) { clear(); setVisible(false); setMessage(remove ? 'Removal could not be confirmed. Refresh or retry.' : 'Photo unavailable. Refresh history or retry.'); } }
    finally { if (current()) setBusy(false); }
  }
  return <div className="staff-photo" aria-busy={busy}>
    <button className="back" disabled={busy} onClick={() => { void request(false); }}>View photo</button>
    <button className="back" disabled={busy} onClick={() => { void request(true); }}>Remove photo</button>
    {(visible || busy) && <button className="back" onClick={hide}>Hide photo</button>}
    <canvas ref={canvas} hidden={!visible} role="img" aria-label="Private visit photo" />
    {message && <p role="status">{message}</p>}
  </div>;
}

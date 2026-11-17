import { useEffect, useRef, useState } from 'react';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { faceConsentVersion, faceEnrollmentSchema, faceListSchema, faceMatchResponseSchema, faceRemovedSchema, faceStatusSchema, withdrawalCodeSchema } from '../../../packages/contracts/face.ts';
import { checkinResponseSchema } from '../../../packages/contracts/checkin.ts';

type Props = { session: BrowserSession; onSessionInvalid: () => void };
export function useFaceCapability(session: BrowserSession | null) {
  const [capability, setCapability] = useState({ enabled: false, ready: false });
  useEffect(() => {
    setCapability({ enabled: false, ready: false });
    if (!session) return;
    const abort = new AbortController();
    void fetch('/api/v1/face/status', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]), redirect: 'error' })
      .then(async response => { if (!response.ok) throw new Error(); const result = faceStatusSchema.parse(await response.json()); if (!abort.signal.aborted) setCapability(result); }).catch(() => {});
    return () => abort.abort();
  }, [session?.csrfToken]);
  return capability;
}
async function faceRequest(route: string, session: BrowserSession, body: unknown, signal: AbortSignal, onSessionInvalid: () => void, method = 'POST') {
  const response = await fetch(route, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 401 || response.status === 403) { onSessionInvalid(); throw new Error(); }
  if (!response.ok) throw new Error();
  return response.json() as Promise<unknown>;
}
function useFaceCamera(onCameraChange: (live: boolean) => void) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), image = useRef<string | null>(null);
  const stream = useRef<MediaStream | null>(null), generation = useRef(0), active = useRef(true), controller = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'off' | 'starting' | 'live' | 'captured'>('off'), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  function stop() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; onCameraChange(false); }
  function clear() { stop(); image.current = null; if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } }
  function cancel() { generation.current++; controller.current?.abort(); clear(); inFlight.current = false; setBusy(false); setMode('off'); }
  useEffect(() => () => { active.current = false; generation.current++; controller.current?.abort(); clear(); }, []);
  async function start() {
    cancel(); setMessage(''); setMode('starting'); const version = generation.current;
    try {
      const result = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!active.current || generation.current !== version) { result.getTracks().forEach(track => track.stop()); return; }
      stream.current = result; onCameraChange(true); video.current!.srcObject = result; await video.current!.play();
      if (active.current && generation.current === version) setMode('live');
    } catch { if (active.current && generation.current === version) { clear(); setMode('off'); setMessage('Camera unavailable. Manual check-in is always available.'); } }
  }
  function capture() {
    const source = video.current, target = canvas.current;
    if (!source || !target || !source.videoWidth || source.videoWidth > 4096 || source.videoHeight > 4096) { setMessage('Camera frame unavailable. Try again.'); return; }
    const ratio = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
    target.width = Math.round(source.videoWidth * ratio); target.height = Math.round(source.videoHeight * ratio);
    const context = target.getContext('2d'); if (!context) return;
    context.drawImage(source, 0, 0, target.width, target.height);
    const encoded = target.toDataURL('image/jpeg', 0.85).split(',')[1];
    if (!encoded || encoded.length > 699052) { clear(); setMode('off'); setMessage('Capture too large. Try again.'); return; }
    image.current = encoded; stop(); setMode('captured'); setMessage('');
  }
  async function operation<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); controller.current = new AbortController(); const version = generation.current;
    try { const result = await action(controller.current.signal); if (active.current && generation.current === version) return result; }
    catch { if (active.current && generation.current === version) setMessage('Could not confirm this operation. Retry the same attempt, withdraw enrollment, or use manual check-in.'); }
    finally { if (active.current && generation.current === version) { setBusy(false); inFlight.current = false; } }
  }
  return { video, canvas, image, mode, message, setMessage, busy, start, capture, cancel, clear, operation };
}
function CameraView({ camera }: { camera: ReturnType<typeof useFaceCamera> }) {
  return <><video ref={camera.video} hidden={camera.mode !== 'live' && camera.mode !== 'starting'} muted playsInline aria-label="Face camera preview" />
    <canvas ref={camera.canvas} hidden={camera.mode !== 'captured'} role="img" aria-label="Face capture preview" />
    {camera.message && <p role="alert">{camera.message}</p>}</>;
}
export function FaceEnrollment({ session, onSessionInvalid, onCameraChange, visitId, idempotencyKey }: Props & { visitId: string; idempotencyKey: string; onCameraChange: (live: boolean) => void }) {
  const [consent, setConsent] = useState(false), [receipt, setReceipt] = useState<ReturnType<typeof faceEnrollmentSchema.parse> | null>(null), [removed, setRemoved] = useState(false);
  const submitted = useRef(false), camera = useFaceCamera(onCameraChange);
  const capability = useFaceCapability(session);
  if (!capability.enabled) return <p>Face enrollment is disabled. Your manual check-in is already recorded.</p>;
  async function enroll() {
    if (!consent || !camera.image.current) return;
    submitted.current = true;
    const result = await camera.operation(async signal => faceEnrollmentSchema.parse(await faceRequest('/api/v1/face/enroll', session, { visitId, idempotencyKey, image: camera.image.current, consent: true, consentVersion: faceConsentVersion }, signal, onSessionInvalid)));
    if (result) { camera.clear(); setReceipt(result); camera.setMessage(''); }
  }
  async function withdraw() {
    camera.cancel();
    const result = await camera.operation(async signal => faceRemovedSchema.parse(await faceRequest('/api/v1/face/withdraw', session, { visitId, idempotencyKey }, signal, onSessionInvalid)));
    if (result) { setReceipt(null); setConsent(false); setRemoved(true); submitted.current = false; camera.clear(); camera.setMessage('Enrollment withdrawn.'); }
  }
  return <section className="visit-photo" aria-label="Optional face enrollment" aria-busy={camera.busy}>
    <h3>Optional face enrollment</h3>
    <p>Face matches can be wrong and a photo or video may spoof the camera. This does not verify university identity or authorize equipment use.</p>
    {receipt ? <><p>Enrollment saved until {new Date(receipt.expiresAt).toLocaleDateString('en-US')}. Keep this withdrawal code privately to remove it later.</p>
      <label htmlFor="face-withdrawal-receipt">Withdrawal code</label><input id="face-withdrawal-receipt" value={receipt.withdrawalCode} readOnly autoComplete="off" /></> : !removed && <>
      <label className="photo-consent"><input type="checkbox" checked={consent} disabled={camera.busy} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) camera.cancel(); }} /> I consent to local face matching and encrypted storage of my face template and self-reported name/NetID for up to 90 days. I can withdraw here, with my withdrawal code, or through staff. Manual check-in remains available. My visit photo is separate.</label>
      {!capability.ready && <p>Face service needs attention. Your recorded visit is unaffected.</p>}
      <div className="checkin-controls">
        {camera.mode === 'off' && <button className="back" disabled={!consent || !capability.ready || camera.busy || submitted.current} onClick={() => { void camera.start(); }}>Start enrollment camera</button>}
        {camera.mode === 'live' && <button className="back" disabled={camera.busy} onClick={camera.capture}>Capture face</button>}
        {camera.mode === 'captured' && <button className="back" disabled={camera.busy || !consent} onClick={() => { void enroll(); }}>{submitted.current ? 'Retry same enrollment' : 'Save face enrollment'}</button>}
        {camera.mode !== 'off' && <button className="back" onClick={camera.cancel}>Cancel face capture</button>}
      </div>
    </>}
    {(receipt || submitted.current) && <><p>Leaving does not confirm cancellation of an enrollment request. Use withdrawal if its save is uncertain.</p><button className="back" disabled={camera.busy} onClick={() => { void withdraw(); }}>Withdraw face enrollment</button></>}
    <CameraView camera={camera} />
  </section>;
}
export function FaceCheckin({ session, onSessionInvalid, onCameraChange, onManual, onFinish }: Props & { onCameraChange: (live: boolean) => void; onManual: () => void; onFinish: () => void }) {
  const camera = useFaceCamera(onCameraChange), [consent, setConsent] = useState(false), [matched, setMatched] = useState(false), [attempted, setAttempted] = useState(false), [saved, setSaved] = useState(false);
  const attempt = useRef<{ idempotencyKey: string; ticket: string } | null>(null), matchKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [saved]);
  useEffect(() => () => { attempt.current = null; }, []);
  async function match() {
    if (!consent || !camera.image.current) return;
    const result = await camera.operation(async signal => faceMatchResponseSchema.parse(await faceRequest('/api/v1/face/match', session, { image: camera.image.current, idempotencyKey: matchKey.current }, signal, onSessionInvalid)));
    if (result?.status === 'matched') { attempt.current = { idempotencyKey: matchKey.current, ticket: result.ticket }; camera.clear(); setMatched(true); camera.setMessage('A possible match was found. Confirm within 30 seconds. No university identity verification is implied.'); }
    else if (result) camera.setMessage('No confident match. Use manual check-in or cancel and try a new capture.');
  }
  async function checkin() {
    if (!attempt.current) return;
    setAttempted(true);
    const result = await camera.operation(async signal => checkinResponseSchema.parse(await faceRequest('/api/v1/face/checkin', session, attempt.current, signal, onSessionInvalid)));
    if (result) { attempt.current = null; camera.clear(); setSaved(true); camera.setMessage(''); }
  }
  function reset() { camera.cancel(); attempt.current = null; matchKey.current = crypto.randomUUID(); setMatched(false); setAttempted(false); }
  return <section className="checkin visit-photo" aria-label="Face check-in" aria-busy={camera.busy}>
    <h2 ref={heading} tabIndex={-1}>{saved ? 'Check-in recorded' : 'Optional face check-in'}</h2>
    {saved ? <><p>Your visit was saved. Identity is self-reported.</p><button className="back" onClick={onFinish}>Finish</button></> : <>
      <p>For previously enrolled visitors. Matching can be wrong and can be spoofed with a photo or video. Manual check-in is always available. Captures are processed locally and are not saved.</p>
      {!matched && <><label className="photo-consent"><input type="checkbox" checked={consent} disabled={camera.busy} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) reset(); }} /> I choose local face matching for this check-in.</label>
        {camera.mode === 'off' && <button className="back" disabled={!consent || camera.busy} onClick={() => { void camera.start(); }}>Start matching camera</button>}
        {camera.mode === 'live' && <button className="back" disabled={camera.busy} onClick={camera.capture}>Capture face</button>}
        {camera.mode === 'captured' && <button className="back" disabled={!consent || camera.busy} onClick={() => { void match(); }}>Find a match</button>}
      </>}
      {matched && <button className="back" disabled={camera.busy} onClick={() => { void checkin(); }}>{attempted ? 'Retry same face check-in' : 'Record face check-in'}</button>}
      {attempted && <p>Confirmation may have been lost. Retry the same face check-in to avoid recording a duplicate. Starting over or using manual check-in may record another visit.</p>}
      <div className="checkin-controls"><button className="back" onClick={reset}>Cancel and clear face attempt</button><button className="back" onClick={onManual}>Use manual check-in</button><button className="back" onClick={onFinish}>Back to welcome</button></div>
    </>}
    <CameraView camera={camera} />
  </section>;
}
export function FaceWithdrawal({ session, onSessionInvalid }: Props) {
  const [code, setCode] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => () => { active.current = false; abort.current?.abort(); }, []);
  return <form className="checkin" autoComplete="off" onSubmit={event => {
    event.preventDefault(); if (busy || !withdrawalCodeSchema.safeParse(code).success) { setMessage('Enter the complete withdrawal code.'); return; }
    abort.current = new AbortController(); setBusy(true);
    void faceRequest('/api/v1/face/withdraw', session, { code }, abort.current.signal, onSessionInvalid).then(body => { faceRemovedSchema.parse(body); if (active.current) { setCode(''); setMessage('Withdrawal request processed. Any matching enrollment has been removed.'); } }).catch(() => { if (active.current) setMessage('Could not confirm withdrawal. Retry or ask staff.'); }).finally(() => { if (active.current) setBusy(false); });
  }}><h3>Withdraw face enrollment</h3><label htmlFor="withdrawal-code">Private withdrawal code</label><input id="withdrawal-code" value={code} onChange={event => setCode(event.target.value)} maxLength={43} autoComplete="off" spellCheck={false} disabled={busy} /><button className="back" disabled={busy}>Withdraw enrollment</button>{message && <p role="status">{message}</p>}</form>;
}
export function StaffFaces({ session, onSessionInvalid }: Props) {
  const capability = useFaceCapability(session), [page, setPage] = useState<ReturnType<typeof faceListSchema.parse> | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null), active = useRef(true), inFlight = useRef(false);
  useEffect(() => () => { active.current = false; abort.current?.abort(); }, []);
  async function request(after?: string, remove?: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); abort.current = new AbortController();
    try {
      if (remove) faceRemovedSchema.parse(await faceRequest(`/api/v1/staff/face/enrollments/${remove}`, session, {}, abort.current.signal, onSessionInvalid, 'DELETE'));
      const result = faceListSchema.parse(await faceRequest(`/api/v1/staff/face/enrollments${after ? `?after=${after}` : ''}`, session, undefined, abort.current.signal, onSessionInvalid, 'GET'));
      if (active.current) { setPage(result); setMessage(''); }
    } catch { if (active.current) { setPage(null); setMessage('Face enrollments unavailable.'); } }
    finally { if (active.current) setBusy(false); inFlight.current = false; }
  }
  if (!capability.enabled) return null;
  return <section className="checkin face-enrollments" aria-label="Staff face enrollments" aria-busy={busy}><h3>Face enrollments</h3><button className="back" disabled={busy} onClick={() => { void request(); }}>Load face enrollments</button>
    {page && <><ul>{page.records.map(row => <li key={row.enrollmentId}>{row.name} ({row.netId}) — expires {new Date(row.expiresAt).toLocaleDateString('en-US')}<button className="back" disabled={busy} onClick={() => { void request(undefined, row.enrollmentId); }}>Revoke enrollment</button></li>)}</ul>{page.next && <button className="back" disabled={busy} onClick={() => { void request(page.next!); }}>Next enrollments</button>}</>}{message && <p role="status">{message}</p>}</section>;
}

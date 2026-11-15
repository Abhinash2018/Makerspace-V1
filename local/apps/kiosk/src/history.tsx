import { useEffect, useRef, useState } from 'react';
import type { BrowserSession } from '../../../packages/contracts/index.ts';
import { errorSchema } from '../../../packages/contracts/index.ts';
import { historyFilterSchema, historyResponseSchema, type HistoryFilter, type HistoryResponse } from '../../../packages/contracts/history.ts';

const central = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export function StaffHistory({ session, onSessionInvalid }: { session: BrowserSession; onSessionInvalid: () => void }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [filters, setFilters] = useState<HistoryFilter>({});
  const [page, setPage] = useState<HistoryResponse | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [cursors, setCursors] = useState<string[]>(['']), [position, setPosition] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), active = useRef(true), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const invalid = useRef(onSessionInvalid), urls = useRef(new Set<string>()), timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  invalid.current = onSessionInvalid;
  useEffect(() => {
    heading.current?.focus(); void load({}, '');
    return () => { active.current = false; epoch.current++; controller.current?.abort(); for (const url of urls.current) URL.revokeObjectURL(url); for (const timer of timers.current) clearTimeout(timer); urls.current.clear(); timers.current.clear(); };
  }, []);
  function begin() { epoch.current++; controller.current?.abort(); controller.current = new AbortController(); setBusy(true); setMessage(''); return { request: epoch.current, signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(3500)]) }; }
  function current(request: number) { return active.current && request === epoch.current; }
  async function failure(response: Response, request: number) {
    if (!current(request)) return;
    if (response.status === 401 || response.status === 403) { setPage(null); invalid.current(); return; }
    const parsed = errorSchema.safeParse(await response.json());
    if (!current(request)) return;
    setMessage(parsed.success && parsed.data.error.code === 'export_too_large' ? 'More than 500 visits match. Choose a narrower date range before exporting.'
      : response.status === 400 ? 'The date range or page expired. Apply filters or refresh history.' : response.status === 429 ? 'Too many staff requests. Wait a minute, then try again.' : 'Visit history is unavailable. Please try again.');
  }
  async function load(selected: HistoryFilter, cursor: string) {
    const { request, signal } = begin(); setPage(null);
    const query = new URLSearchParams({ limit: '25', ...(selected.from ? { from: selected.from, to: selected.to! } : {}), ...(cursor ? { cursor } : {}) });
    try {
      const response = await fetch(`/api/v1/staff/visits?${query}`, { signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      if (!current(request)) return;
      if (!response.ok) { await failure(response, request); return; }
      const result = historyResponseSchema.parse(await response.json());
      if (current(request)) setPage(result);
    } catch { if (current(request)) setMessage('Visit history is unavailable. Please try again.'); }
    finally { if (current(request)) { setBusy(false); controller.current = null; } }
  }
  function reset(selected: HistoryFilter) { setCursors(['']); setPosition(0); setFilters(selected); void load(selected, ''); }
  async function download() {
    const { request, signal } = begin();
    try {
      const response = await fetch('/api/v1/staff/visits/export', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(filters),
      });
      if (!current(request)) return;
      if (!response.ok) { await failure(response, request); return; }
      if (!response.headers.get('content-type')?.startsWith('text/csv')) throw new Error('Invalid export.');
      const blob = await response.blob();
      if (!current(request)) return;
      if (blob.size > 262144) throw new Error('Invalid export.');
      const url = URL.createObjectURL(blob); urls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'makerspace-visits.csv'; anchor.click();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); timers.current.delete(timer); }, 1000); timers.current.add(timer);
      setMessage('CSV download prepared. Keep the exported copy private.');
    } catch { if (current(request)) setMessage('Export is unavailable. Please try again.'); }
    finally { if (current(request)) { setBusy(false); controller.current = null; } }
  }
  return <section className="staff-history" aria-labelledby="history-title" aria-busy={busy}>
    <h2 id="history-title" ref={heading} tabIndex={-1}>Visit history</h2>
    <p>Names and NetIDs are self-reported. Only retained visits from the last 30 days are shown. Times and date filters use Central time (America/Chicago).</p>
    <form className="history-filters" onSubmit={event => { event.preventDefault(); const selected = historyFilterSchema.safeParse(from || to ? { from, to } : {}); if (!selected.success) { setMessage('Choose both valid dates, in order, covering at most 30 days, or leave both blank.'); return; } reset(selected.data); }}>
      <label>From date<input type="date" value={from} onChange={event => setFrom(event.target.value)} disabled={busy} /></label>
      <label>To date<input type="date" value={to} onChange={event => setTo(event.target.value)} disabled={busy} /></label>
      <button className="back" disabled={busy} type="submit">Apply dates</button>
      <button className="back" disabled={busy} type="button" onClick={() => reset(filters)}>Refresh history</button>
    </form>
    {busy && <p role="status">Loading staff data…</p>}
    {message && <p className="access-message" role="status">{message}</p>}
    {page && <>
      {!page.items.length ? <p>No retained visits match this date range.</p> : <div className="history-table" tabIndex={0} role="region" aria-label="Visit history table"><table role="table">
        <thead><tr><th scope="col">Central time</th><th scope="col">Name</th><th scope="col">NetID</th><th scope="col">Identity</th></tr></thead>
        <tbody>{page.items.map(row => <tr key={row.visitId}><td data-label="Central time"><time dateTime={row.recordedAt}>{central.format(new Date(row.recordedAt))}</time></td><td data-label="Name">{row.name}</td><td data-label="NetID">{row.netId}</td><td data-label="Identity">Self-reported</td></tr>)}</tbody>
      </table></div>}
      <p className="note">Page {position + 1}; {page.items.length} visits shown. New arrivals appear after Refresh history.</p>
    </>}
    <div className="history-controls">
      <button className="back" type="button" disabled={busy || position === 0} onClick={() => { setPosition(position - 1); void load(filters, cursors[position - 1]!); }}>Previous page</button>
      <button className="back" type="button" disabled={busy || !page?.nextCursor} onClick={() => { const next = page!.nextCursor!; setCursors([...cursors.slice(0, position + 1), next]); setPosition(position + 1); void load(filters, next); }}>Next page</button>
      <button className="back" type="button" disabled={busy || !page} onClick={() => { void download(); }}>Export CSV</button>
    </div>
    <p className="note">Export includes up to 500 currently retained matching visits. Exports are private copies and need separate retention; spreadsheet-safe text is not a lossless database import.</p>
  </section>;
}

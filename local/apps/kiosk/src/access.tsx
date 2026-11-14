import { useEffect, useRef, useState } from 'react';
import { errorSchema, sessionResponseSchema, signedOutSchema } from '../../../packages/contracts/index.ts';
import type { BrowserSession } from '../../../packages/contracts/index.ts';

class AccessError extends Error {
  readonly code: string;
  constructor(code: string) { super('Access request failed.'); this.code = code; }
}
const messages: Record<string, string> = {
  unauthorized: 'Sign-in failed or the session expired. Please try again.',
  forbidden_csrf: 'Your session changed. Please try again.', forbidden_role: 'Please start a new session to sign in.',
  rate_limited: 'Too many attempts. Wait a minute before trying again.',
  auth_unavailable: 'Staff sign-in is unavailable. Please contact the local operator.',
  session_capacity: 'Sessions are busy. Please wait before trying again.',
};
async function request<T>(url: string, schema: { parse(value: unknown): T }, body?: object, csrf?: string): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Kiosk-Bootstrap': '1', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json());
    throw new AccessError(parsed.success ? parsed.data.error.code : 'unavailable');
  }
  return schema.parse(await response.json());
}
async function readSession() {
  try { return await request('/api/v1/session', sessionResponseSchema); }
  catch (error) { if (error instanceof AccessError && error.code === 'unauthorized') return null; throw error; }
}
export function useAccess() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef<BrowserSession | null>(null);
  const pending = useRef(false), epoch = useRef(0);
  function apply(value: BrowserSession | null) { current.current = value; setSession(value); }
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const started = epoch.current;
      if (!pending.current) {
        try {
          const value = await readSession();
          if (active && started === epoch.current && !pending.current) {
            if (!value && current.current) setMessage('Your session expired. Please begin or sign in again.');
            apply(value);
          }
        } catch {
          if (active && started === epoch.current && !pending.current) {
            apply(null); setMessage('Session unavailable. Please check the local gateway.');
          }
        }
      }
      if (active) timer = setTimeout(() => { void poll(); }, 5000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  async function change(operation: () => Promise<BrowserSession | null>) {
    if (pending.current) return false;
    pending.current = true; epoch.current++; setBusy(true); setMessage('');
    try { apply(await operation()); return true; }
    catch (error) {
      setMessage(error instanceof AccessError ? messages[error.code] ?? 'The request could not be completed. Please try again.' : 'Could not reach the local gateway. Please try again.');
      return false;
    } finally { epoch.current++; pending.current = false; setBusy(false); }
  }
  return {
    session, busy, message,
    begin: () => change(async () => {
      const previous = await readSession();
      return request('/api/v1/session', sessionResponseSchema, {}, previous?.csrfToken);
    }),
    signIn: (password: string) => change(async () => {
      const previous = await readSession() ?? await request('/api/v1/session', sessionResponseSchema, {});
      if (previous.role === 'staff') return previous;
      return request('/api/v1/staff/login', sessionResponseSchema, { password }, previous.csrfToken);
    }),
    signOut: () => change(async () => {
      const previous = await readSession();
      if (previous?.role === 'staff') await request('/api/v1/staff/logout', signedOutSchema, {}, previous.csrfToken);
      return null;
    }),
  };
}

export function StaffAccess({ access }: { access: ReturnType<typeof useAccess> }) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null), password = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && !access.busy) password.current?.focus(); }, [open, access.busy]);
  useEffect(() => { form.current?.reset(); }, [access.session?.role]);
  return <section className="staff-access" aria-label="Staff access">
    {access.session?.role === 'staff' ? <>
      <p aria-live="polite">Staff access active</p>
      <p className="note">Staff tools are coming soon. Begin starts a new visitor session and signs staff out.</p>
      <button className="back" disabled={access.busy} onClick={() => { void access.signOut(); }}>Sign out</button>
    </> : <>
      <button className="back" disabled={access.busy} onClick={() => setOpen(value => !value)} aria-expanded={open}>Staff sign in</button>
      {open && <form ref={form} autoComplete="off" onSubmit={async event => {
        event.preventDefault();
        const element = event.currentTarget;
        const value = String(new FormData(element).get('password') ?? '');
        element.reset();
        if (await access.signIn(value)) setOpen(false);
      }}>
        <h3>Staff sign in</h3>
        <label htmlFor="staff-password">Staff password</label>
        <input id="staff-password" ref={password} name="password" type="password" autoComplete="off" maxLength={256} required disabled={access.busy} />
        <button className="back" type="submit" disabled={access.busy}>{access.busy ? 'Signing in…' : 'Sign in'}</button>
        <button className="back" type="button" disabled={access.busy} onClick={() => { form.current?.reset(); setOpen(false); }}>Cancel</button>
      </form>}
    </>}
    {access.message && <p className="access-message" role="alert">{access.message}</p>}
  </section>;
}

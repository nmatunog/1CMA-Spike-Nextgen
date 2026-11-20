'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { Handoff } from '@/lib/member/contract';
import styles from './member.module.css';
import { GiaAvatar } from '@/components/gia/GiaAvatar';

async function act(body: Record<string, unknown>) {
  const response = await fetch('/api/member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'request_unavailable');
  return data;
}
const errors: Record<string, string> = {
  preview_account_dependency: 'Password setup and verification are not connected on this host. This draft uses a local synthetic mailbox only; no account was created.',
  handoff_not_verified: "We couldn't verify this handoff. Return to Versa for a new handoff.",
  handoff_unavailable: 'This handoff has expired. Return to Versa for a new one.',
  email_verification_required: 'Verify your email before continuing.',
  sign_in_required: 'We could not sign you in. Check your password. For a new account, verify your email using your Versa handoff first.',
  password_invalid: 'Use at least 8 characters, confirm the same password, and check your current password if requested.',
  link_unavailable: "This link can't be used. Request a new one.",
  try_later: 'Please wait before trying again.',
};
function Passwords({ password, confirm, setPassword, setConfirm }: { password: string; confirm: string; setPassword: (value: string) => void; setConfirm: (value: string) => void }) {
  const [visible,setVisible]=useState(false);
  return <><button type="button" className={styles.link} style={{gridColumn:'1 / -1',justifySelf:'end'}} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'Hide passwords':'Show passwords'}</button><label className={styles.field}><span className={styles['field-label']}>Password</span><input type={visible ? 'text' : 'password'} placeholder="8 characters minimum" autoComplete="new-password" minLength={8} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    <label className={styles.field}><span className={styles['field-label']}>Confirm password</span><input type={visible ? 'text' : 'password'} placeholder="8 characters minimum" autoComplete="new-password" minLength={8} maxLength={256} value={confirm} onChange={event => setConfirm(event.target.value)} required /></label></>;
}
function HeroHead({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return <div className={styles['hero-head']}><a href="/spike-preview" className={styles.avatar} aria-label="Ask GIA"><GiaAvatar className={styles.avatarMark} /></a><div className={styles['hero-text']}><h1>{title}</h1>{children && <p className={styles.lede}>{children}</p>}</div></div>;
}
function message(error: unknown) { return errors[error instanceof Error ? error.message : ''] || 'This request is unavailable. Please try again or return for a new handoff.'; }
export function MemberSignup({ fields, preview=false }: { fields: Omit<Handoff, 'extra'>; preview?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (preview) {
        const response=await fetch('/api/member/preview-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirm})});
        const result=await response.json(); if(!response.ok) throw new Error(result.error);
      } else await act({ action: 'signup', password, confirm });
      router.push('/signup-done');
    }
    catch (failure) { if (failure instanceof Error && failure.message === 'sign_in_required') { router.push('/signin'); } else setError(message(failure)); }
    finally { setPassword(''); setConfirm(''); setBusy(false); }
  }
  return <section className={`${styles.card} ${styles.signup}`} aria-label="Create your SPIKE account">
    <HeroHead title={<>Welcome, {fields.mfn}!</>}>GIA here. Set your password to start your SPIKE journey.</HeroHead>
    {preview && <p>Unverified synthetic Versa details. Verify your email before account activation.</p>}
    <dl className={styles.details} aria-label="Read-only Versa details">
      {[['Name', `${fields.mfn} ${fields.mln}`], ['Email (your username)', fields.me], ['Sponsor', `${fields.sfn} ${fields.sln}`], ['Access code', fields.code]].map(([label,value]) => <div className={styles.detail} key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {preview && <label className={styles.field}>Email (your username)<input type="email" value={fields.me} readOnly autoComplete="username" /></label>}
    <form method="post" onSubmit={submit}><div className={styles.fields}><Passwords password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} /></div><button className={styles.btn} disabled={busy} type="submit">{busy ? 'Please wait…' : preview ? 'Create account & meet GIA' : 'Create my account'}</button></form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function SignupDone() {
  return <section className={styles.card} data-center-mobile><HeroHead title="Check your email">No email was sent. Open the link in the local test mailbox, then sign in.</HeroHead><a className={styles.btn} href="/signin">Go to sign in</a></section>;
}
export function MemberSignIn({ initialEmail = '', hasHandoff = false, verified = false, meetGia=false }: { initialEmail?: string; hasHandoff?: boolean; verified?: boolean; meetGia?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [forgot, setForgot] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  async function verifyFirst() { await act({ action: 'begin' }); router.push('/signup-done'); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (forgot) { setStatus((await act({ action: 'forgot', email })).message); }
      else {
        const result = await signIn('member', { email, password, redirect: false });
        if (result?.error) {
          if (hasHandoff && !verified && email.toLowerCase() === initialEmail) { await verifyFirst(); return; }
          throw new Error('sign_in_required');
        }
        if (hasHandoff && email.toLowerCase() === initialEmail) {
          if (!verified) { await verifyFirst(); return; }
          await act({ action: 'claim' });
        }
        router.push(meetGia ? '/gia' : '/member/account');
      }
    } catch (failure) { setError(message(failure)); }
    finally { setPassword(''); setBusy(false); }
  }
  return <section className={styles.card} data-center-mobile>
    <HeroHead title={forgot ? 'Forgot password' : 'Welcome back'} />
    <form method="post" onSubmit={submit}><div className={styles['fields-stack']}>
      <label className={styles.field}><span className={styles['field-label']}>Email</span><input type="email" placeholder="you@example.com" autoComplete="username" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required /></label>
      {!forgot && <label className={styles.field}><span className={styles['field-label']}>Password</span><input type="password" placeholder="Your password" autoComplete="current-password" maxLength={256} value={password} onChange={event => setPassword(event.target.value)} required /></label>}
    </div><button className={styles.btn} disabled={busy} type="submit">{forgot ? 'Request reset link' : 'Sign in'}</button></form>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
    <div className={styles.links}><button className={styles.link} type="button" onClick={() => { setForgot(!forgot); setStatus(''); setError(''); }}>{forgot ? 'Back to sign in' : 'Forgot password?'}</button><a className={styles['link-quiet']} href="/spike-preview">New here? <strong>Ask GIA</strong></a></div>
  </section>;
}
export function EmailLink({ kind }: { kind: 'verify' | 'reset' }) {
  const router = useRouter();
  const [token, setToken] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  useEffect(() => {
    function readLink() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(null, '', window.location.pathname);
      if (value) { setToken(value); setError(''); setDone(false); }
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await act(kind === 'verify' ? { action: 'verify', token } : { action: 'reset', token, password, confirm });
      setToken('');
      if (kind === 'verify') { router.replace('/signin'); }
      else { await signOut({ redirect: false }); setDone(true); }
    } catch (failure) { setError(message(failure)); }
    finally { setPassword(''); setConfirm(''); setBusy(false); }
  }
  return <section className={styles.card} data-center-mobile><h1>{kind === 'verify' ? 'Verify your email' : 'Reset your password'}</h1>
    {done ? <p>Password changed. <a href="/signin">Sign in again</a>.</p> : <form method="post" onSubmit={submit}>
      {kind === 'reset' && <div className={styles['fields-stack']}><Passwords password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} /></div>}
      <button className={styles.btn} type="submit" disabled={busy || !token}>{kind === 'verify' ? 'Confirm my email' : 'Reset password'}</button>
      {!token && <p>Open your verification or reset link again, or request a new one.</p>}
    </form>}
    {error && <p role="alert">{error}</p>}<div className={styles.links}><a href="/gia">Ask GIA</a><a href="/signin">Sign in</a></div>
  </section>;
}
export function MemberAccount({ email }: { email: string }) {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function leave() {
    try { await act({ action: 'logout' }); } catch { /* Clear the browser session even when it already expired. */ } finally { await signOut({ redirect: false }); router.replace('/signin'); }
  }
  async function change(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await act({ action: 'change', currentPassword, password, confirm }); await signOut({ redirect: false }); router.replace('/signin'); }
    catch (failure) { setError(message(failure)); }
    finally { setCurrent(''); setPassword(''); setConfirm(''); setBusy(false); }
  }
  return <section className={styles.card}><h1>Your SPIKE account</h1><p>{email}</p>
    <p>Your account is active. This handoff grants no course access. L1/L2 entry gates still apply.</p>
    <form method="post" onSubmit={change}><h2>Change password</h2><div className={styles['fields-stack']}>
      <label className={styles.field}>Current password<input type="password" autoComplete="current-password" maxLength={256} value={currentPassword} onChange={event => setCurrent(event.target.value)} required /></label>
      <Passwords password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
      </div><button className={styles.btn} type="submit" disabled={busy}>Change password</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div className={styles.links}><button className={styles.link} type="button" onClick={leave}>Sign out</button><a href="/gia">Ask GIA</a></div>
  </section>;
}

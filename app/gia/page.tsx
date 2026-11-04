'use client';
import { useState } from 'react';
import { welcome, NOTICE } from '@/lib/gia/engine.mjs';
import styles from './pilot.module.css';
type Turn = { text: string; citation?: { id: string; version: string; source: string } };
export default function Gia() {
  const [turns, setTurns] = useState<Turn[]>([{ text: welcome }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [sessions, setSessions] = useState<{id:string;starts_at:string;seats_left:number}[]>([]);
  const [contact, setContact] = useState({ name: '', email: '' });
  const add = (text: string) => setTurns(t => [...t, { text }]);
  async function call(action: string, extra = {}) {
    setBusy(true);
    try {
      const res = await fetch('/api/gia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) { add(`Request not completed: ${data.error}. Please try again or contact your leader.`); return; }
      if (data.text) setTurns(t => [...t, data]);
      if (data.message) add(data.message);
      if (action === 'consent') { setSaved(true); add('Your consent and contact have been saved for recruitment follow-up.'); }
      if (data.booking) add(`Your FEP booking is saved. Reference: ${data.booking.id}. Email confirmation is not connected in this pilot.`);
      if (data.handoff) add(`Your leader request is saved. Reference: ${data.handoff.id}. The response target is 24 hours.`);
      if (data.sessions) { setSessions(data.sessions); if (!data.sessions.length) add('No FEP sessions are currently available. You can request a leader.'); }
      if (action === 'opt_out' || data.message?.includes('opted out')) { setStopped(true); setSaved(false); }
    } catch { add('The service could not be reached. Your request is not confirmed. Please retry.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.pilot} style={{ maxWidth: 760, margin: 'auto', padding: '24px 16px', display: 'grid', gap: 20 }}>
    <header><p>1CMA · Controlled synthetic-data pilot</p><h1>GIA — Your 1CMA AI Guide</h1><p>Learning does not authorize you to sell insurance or give insurance advice.</p><a href='/gia/privacy'>Privacy notice</a></header>
    <section aria-label='Conversation' aria-live='polite' style={{ display: 'grid', gap: 12 }}>{turns.map((t, i) => <article key={i} style={{ padding: 16, border: '1px solid #64748b', borderRadius: 12, overflowWrap: 'anywhere' }}><p>{t.text}</p>{t.citation && <a href={t.citation.source}>{t.citation.id} · v{t.citation.version}</a>}</article>)}</section>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{['Join Free Financial Literacy', 'Explore Free Financial Entrepreneurship Preview', 'Talk to a 1CMA Leader'].map(label => <button disabled={busy || stopped} key={label} onClick={() => call('message', { text: label })}>{label}</button>)}</div>
    {!saved && !stopped && <form onSubmit={e => { e.preventDefault(); if (consent) call('consent', { ...contact, agree: true, notice: NOTICE }); }} style={{ display: 'grid', gap: 12 }}>
      <h2>Save a contact for booking or leader follow-up</h2><p>Use synthetic details only. Your name and email will be shared with authorized 1CMA staff for recruitment, booking and follow-up. STOP stops future contact. Do not send IDs or documents.</p>
      <label>Name <input required maxLength={100} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })}/></label>
      <label>Email <input required type='email' maxLength={254} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })}/></label>
      <label><input type='checkbox' checked={consent} onChange={e => setConsent(e.target.checked)}/> I have read the privacy notice and consent to storing these details for recruitment, booking and leader follow-up.</label>
      <button disabled={!consent || busy}>Save consent and contact</button>
    </form>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><button disabled={busy || stopped} onClick={() => call('list_fep_sessions')}>Show FEP sessions</button><button disabled={!saved || busy || stopped} onClick={() => call('request_leader', { reason: 'leader_requested' })}>Save leader request</button><button disabled={busy} onClick={() => call('opt_out')}>STOP / opt out</button></div>
    {sessions.map(s => <article key={s.id}><p>{new Date(s.starts_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Manila · {s.seats_left} seats</p><button disabled={!saved || busy || stopped || s.seats_left < 1} onClick={() => call('book_fep', { sessionId: s.id })}>Book this FEP</button></article>)}
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) { call('message', { text }); setText(''); } }} style={{ display: 'flex', gap: 8 }}><input aria-label='Message GIA' placeholder='Ask GIA or request Bisaya / Tagalog' maxLength={1000} value={text} onChange={e => setText(e.target.value)} style={{ flex: 1, minWidth: 0 }}/><button disabled={busy || stopped || !text.trim()}>Send</button></form>
    <style>{`button,input { font: inherit; padding: 10px; } button { border: 1px solid #64748b; border-radius: 8px; cursor: pointer; } button:disabled { opacity: .5; cursor: default; } h1 { font-size: clamp(1.5rem, 5vw, 2rem); }`}</style>
  </main>;
}

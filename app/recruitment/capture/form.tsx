'use client';
import { useState, type FormEvent } from 'react';
import { COMM_CHANNELS } from '@/lib/mvp01/interfaces';
import styles from '../command/command.module.css';

export default function CaptureForm() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const channelPrefs: Record<string, boolean> = {};
    for (const channel of COMM_CHANNELS) {
      channelPrefs[channel] = f.get(`pref_${channel}`) === 'on';
    }
    try {
      const r = await fetch('/api/recruitment/command/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.get('name'),
          email: f.get('email') || '',
          phone: f.get('phone') || '',
          source: f.get('source') || 'manual',
          campaign: f.get('campaign') || '',
          programInterest: f.get('interest') || '',
          versaLeadRef: f.get('vlr') || '',
          consentGranted: f.get('consent') === 'on',
          noticeVersion: f.get('notice') || '',
          channelPrefs,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(d.error === 'duplicate_verified' ? 'Verified identity already exists' : 'Capture failed');
        return;
      }
      (e.target as HTMLFormElement).reset();
      const consent = d.consent || 'unknown';
      const messageable = consent === 'granted';
      const flagNote = d.flagged
        ? (d.flagKind === 'possible' ? ' · possible name match' : ' · duplicate flagged')
        : '';
      setMessage(`Prospect captured · consent ${consent}${messageable ? '' : ' · cannot be messaged until consent is granted'}${flagNote}`);
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <h1>Capture prospect</h1>
      <p className={styles.lede}>Mobile-first intake. Consent is never inferred and is not required to capture. Consent unknown means this person cannot be messaged until explicit consent is recorded. STOP identities are rejected.</p>
      <p className={styles.status} role="status">{message}</p>
      <p className={styles.meta}><a href="/recruitment/command">Back to Command Center</a></p>
      <form className={styles.filters} onSubmit={submit}>
        <label className={styles.field}>Name
          <input name="name" required maxLength={120} />
        </label>
        <label className={styles.field}>Email
          <input name="email" type="email" maxLength={120} />
        </label>
        <label className={styles.field}>Phone
          <input name="phone" maxLength={20} />
        </label>
        <label className={styles.field}>Campaign
          <input name="campaign" maxLength={80} />
        </label>
        <label className={styles.field}>Source
          <select name="source" defaultValue="manual">
            <option value="manual">manual</option>
            <option value="versa">versa</option>
            <option value="messenger">messenger</option>
          </select>
        </label>
        <label className={styles.field}>Program interest
          <input name="interest" maxLength={80} />
        </label>
        <label className={styles.field}>Versa lead ref
          <input name="vlr" maxLength={80} />
        </label>
        <label className={styles.field}>Consent notice version
          <input name="notice" maxLength={80} placeholder="only if consent is given" />
        </label>
        {COMM_CHANNELS.map((channel) => (
          <label className={styles.check} key={channel}>
            <input type="checkbox" name={`pref_${channel}`} />
            Allow {channel}
          </label>
        ))}
        <label className={styles.check}>
          <input type="checkbox" name="consent" />
          Explicit consent given (do not tick from a CSV)
        </label>
        <button disabled={busy}>Save prospect</button>
      </form>
    </main>
  );
}

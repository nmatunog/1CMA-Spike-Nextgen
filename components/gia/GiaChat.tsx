'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { welcome, NOTICE } from '@/lib/gia/engine.mjs';
import { RegisterWithRecruiter } from '@/components/gia/RegisterWithRecruiter';
import { AIA_CAREER_CHIPS, AIA_LEVELUP_ASK } from '@/lib/gia/path-picker';
import type { ConsentedContact } from '@/lib/gia/aia-registration-details';
import { resolveRecruiterCta, type RecruiterRegistration } from '@/lib/gia/recruiter-registration';
import { prefersReducedMotion, typingDelayMs } from '@/lib/gia/typing';
import {
  GIA_CONSENT_CHECKBOX,
  GIA_CONSENT_FINE,
  GIA_CONSENT_SAVE,
  GIA_CONSENT_TAG,
  GIA_CONSENT_TITLE,
  GIA_DISCLAIMER,
  GIA_FOOTER_LINE2_PREFIX,
  GIA_NOTICE_PRIVACY,
  GIA_PILOT_BADGE,
  GIA_SUBTITLE,
  GIA_SYSTEM_NOTE,
  GIA_TITLE,
  LEADER_INVITE,
  NEXT_STEP_INVITE,
  resolveGiaPrompt,
  visibleJtbd,
  type GiaProgram,
} from '@/lib/gia/ui-copy';
import styles from './gia-chat.module.css';

type Turn = { kind: 'gia' | 'user'; text: string; citation?: { id: string; version: string; source: string } };
type Program = GiaProgram;
type Session = { id: string; starts_at: string; seats_left: number };
type Seed = { text: string; id: number };

const CONSENT_INTENTS = new Set([
  LEADER_INVITE,
  'Explore Free Financial Entrepreneurship Preview',
  'Show FEP sessions',
  'Save leader request',
]);

export function GiaChat({
  variant = 'page',
  initialPrompt,
  seed,
  defaultRecruiter = null,
  onConsentChange,
  onClose,
}: {
  variant?: 'page' | 'panel';
  initialPrompt?: string;
  seed?: Seed;
  defaultRecruiter?: RecruiterRegistration | null;
  onConsentChange?: (next: { saved: boolean; contact: ConsentedContact | null; program: Program }) => void;
  onClose?: () => void;
}) {
  const [dark, setDark] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([{ kind: 'gia', text: welcome }]);
  const [text, setText] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [contact, setContact] = useState({ name: '', email: '' });
  const [program, setProgram] = useState<Program>('recruit');
  const [stuck, setStuck] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const lastSeed = useRef<number | null>(null);
  const skipTyping = useRef<(() => void) | null>(null);

  const chips = [
    ...visibleJtbd(program).map((item) => item.label),
    ...(program === 'recruit' ? [...AIA_CAREER_CHIPS, AIA_LEVELUP_ASK, NEXT_STEP_INVITE] : []),
  ];
  const nearBottom = () => {
    const el = threadRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const scrollToEnd = () => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  function add(kind: Turn['kind'], next: string, citation?: Turn['citation']) {
    const follow = nearBottom();
    setTurns((t) => [...t, { kind, text: next, citation }]);
    queueMicrotask(() => {
      if (follow) scrollToEnd();
      else setStuck(true);
    });
  }

  function sendMapped(label: string) {
    if (/^\s*stop\s*$/i.test(label)) {
      add('user', 'STOP');
      void call('opt_out');
      return;
    }
    const resolved = resolveGiaPrompt(label);
    if (resolved.program && resolved.program !== program) setProgram(resolved.program);
    add('user', label);
    void call('message', { text: resolved.text, ...(resolved.program ? { program: resolved.program } : {}) });
  }

  async function call(action: string, extra: Record<string, unknown> = {}) {
    if (typeof extra.text === 'string' && CONSENT_INTENTS.has(extra.text) && !saved && !stopped) {
      setShowConsent(true);
    }
    if (action === 'request_leader' || action === 'list_fep_sessions' || action === 'book_fep') {
      if (!saved && !stopped) setShowConsent(true);
    }
    setBusy(true);
    const started = Date.now();
    try {
      const res = await fetch('/api/gia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, program, ...extra }),
      });
      const wait = typingDelayMs(prefersReducedMotion()) - (Date.now() - started);
      if (wait > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, wait);
          skipTyping.current = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        skipTyping.current = null;
      }
      const data = await res.json();
      if (data.discarded) {
        add('gia', data.text);
        return;
      }
      if (!res.ok) {
        if (data.error === 'verification_required') {
          add('gia', data.text || 'Your own status requires a verification code from the mock OTP adapter. No SMS or email provider is used.');
          setNeedOtp(true);
          return;
        }
        if (data.error === 'consent_required') {
          setShowConsent(true);
          add('gia', 'Save a contact with consent before booking or requesting a leader.');
          return;
        }
        add('gia', `Request not completed: ${data.error}. Please try again or contact your leader.`);
        return;
      }
      if (data.text) add('gia', data.text, data.citation);
      if (data.message) add('gia', data.message);
      if (action === 'consent') {
        const nextContact = { name: contact.name.trim(), email: contact.email.trim() };
        setSaved(true);
        setShowConsent(false);
        onConsentChange?.({ saved: true, contact: nextContact, program });
        add(
          'gia',
          program === 'recruit'
            ? 'Your consent and contact have been saved for recruitment follow-up.'
            : 'Your consent and contact have been saved for 1CMA program follow-up.',
        );
      }
      if (data.booking) add('gia', `Your FEP booking is saved. Reference: ${data.booking.id}. Email confirmation is not connected in this pilot.`);
      if (data.handoff) add('gia', `Your leader request is saved. Reference: ${data.handoff.id}. The response target is 24 hours.`);
      if (data.status) {
        add('gia', `Your saved stage is ${data.status.stage}. Program: ${data.status.program || program}. This is only your own record.`);
        setNeedOtp(false);
        setOtp('');
      }
      if (data.sessions) {
        setSessions(data.sessions);
        if (!data.sessions.length) add('gia', 'No FEP sessions are currently available. You can request a leader.');
      }
      if (action === 'opt_out' || data.message?.includes('opted out')) {
        setStopped(true);
        setSaved(false);
        onConsentChange?.({ saved: false, contact: null, program });
        setNeedOtp(false);
        setShowConsent(false);
      }
    } catch {
      add('gia', 'The service could not be reached. Your request is not confirmed. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const incoming = seed?.text ?? initialPrompt;
    const incomingId = seed?.id ?? (initialPrompt ? 0 : null);
    if (!incoming || incomingId == null) return;
    if (lastSeed.current === incomingId) return;
    lastSeed.current = incomingId;
    sendMapped(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- continue from the landing composer or chips
  }, [seed?.id, seed?.text, initialPrompt]);

  function sendChip(label: string) {
    sendMapped(label);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !busy && !stopped) {
        const value = text.trim();
        setText('');
        sendMapped(value);
      }
    }
  }

  const canSave = consent && contact.name.trim() && contact.email.trim() && !busy && !stopped;

  return (
    <div className={`${styles.root} ${dark ? styles.dark : ''} ${variant === 'page' ? styles.page : styles.panel}`}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.mark} aria-hidden="true">G</span>
          <div className={styles.titles}>
            <h1>{GIA_TITLE}</h1>
            <p>{GIA_SUBTITLE}</p>
          </div>
          <span className={styles.badge}>{GIA_PILOT_BADGE}</span>
          <div className={styles.desktopPicker}>
            <span className={styles.programLabel} id="gia-program-label">Which 1CMA program should GIA guide?</span>
            <ProgramPicker program={program} onChange={(next) => { setProgram(next); setSessions([]); }} labelledBy="gia-program-label" />
          </div>
          <a className={styles.privacyHeader} href="/gia/privacy">Privacy notice</a>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeToggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={dark}
              onClick={() => setDark((v) => !v)}
            >
              <span className={styles.themeThumb} />
              <span className={styles.themeIcons} aria-hidden="true">
                <SunIcon />
                <MoonIcon />
              </span>
            </button>
            {onClose && (
              <button type="button" className={styles.closeBtn} aria-label="Close GIA" onClick={onClose}>
                ×
              </button>
            )}
          </div>
        </div>
      </header>
      <div className={`${styles.programRow} ${styles.mobilePicker}`}>
        <span className={styles.programLabel}>Which 1CMA program should GIA guide?</span>
        <ProgramPicker program={program} onChange={(next) => { setProgram(next); setSessions([]); }} labelledBy={undefined} />
      </div>
      <div
        className={styles.threadWrap}
        ref={threadRef}
        onScroll={() => {
          if (nearBottom()) setStuck(false);
        }}
      >
        <div className={styles.thread} aria-label="Conversation" aria-live="polite">
          <p className={styles.note}>{GIA_SYSTEM_NOTE}</p>
          <p className={styles.note}>{GIA_PILOT_BADGE}</p>
          {turns.map((t, i) =>
            t.kind === 'user' ? (
              <div key={i} className={`${styles.row} ${styles.rowUser}`}>
                <div className={styles.bubbleUser}>{t.text}</div>
              </div>
            ) : (
              <div key={i} className={styles.row}>
                <span className={`${styles.mark} ${styles.markSm}`} aria-hidden="true">G</span>
                <div className={styles.col}>
                  <span className={styles.who}>GIA</span>
                  <div className={styles.bubbleGia}>
                    <GiaText text={t.text} />
                    {t.citation && (
                      <p>
                        <a href={t.citation.source}>
                          {t.citation.id} · v{t.citation.version}
                        </a>
                      </p>
                    )}
                  </div>
                  {i === 0 && (
                    <div className={styles.notice}>
                      <span aria-hidden="true">🛡</span>
                      <p>
                        {GIA_NOTICE_PRIVACY} <a href="/gia/privacy">Privacy notice</a>
                      </p>
                    </div>
                  )}
                  {i === turns.length - 1 && t.kind === 'gia' && !busy && (
                    <div className={styles.chips}>
                      {chips.map((label) => (
                        <button key={label} type="button" className={styles.chip} disabled={busy || stopped} onClick={() => sendChip(label)}>
                          {label}
                        </button>
                      ))}
                      {program === 'recruit' && (
                        <button type="button" className={styles.chip} disabled={busy || stopped} onClick={() => { void call('list_fep_sessions'); }}>
                          Show FEP sessions
                        </button>
                      )}
                      <button type="button" className={styles.chip} disabled={!saved || busy || stopped} onClick={() => { void call('request_leader', { reason: 'leader_requested' }); }}>
                        Save leader request
                      </button>
                      <button type="button" className={styles.chip} disabled={!saved || busy || stopped} onClick={() => { void call('get_my_status'); }}>
                        Check my status
                      </button>
                      <button type="button" className={styles.chip} disabled={busy} onClick={() => { void call('opt_out'); }}>
                        STOP / opt out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className={styles.row} aria-label="GIA is typing">
              <span className={`${styles.mark} ${styles.markSm}`} aria-hidden="true">G</span>
              <div className={styles.col}>
                <span className={styles.who}>GIA</span>
                <button
                  type="button"
                  className={`${styles.bubbleGia} ${styles.typingSkip}`}
                  onClick={() => skipTyping.current?.()}
                >
                  <div className={styles.dotWrap}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                  <span className={styles.skipHint}>Skip wait</span>
                </button>
              </div>
            </div>
          )}
          {showConsent && !saved && !stopped && (
            <form
              className={styles.card}
              onSubmit={(e) => {
                e.preventDefault();
                if (canSave) void call('consent', { ...contact, agree: true, notice: NOTICE });
              }}
            >
              <span className={styles.tag}>{GIA_CONSENT_TAG}</span>
              <h2>{GIA_CONSENT_TITLE}</h2>
              <p>{GIA_CONSENT_FINE}</p>
              <label className={styles.field}>
                Name
                <input required maxLength={100} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </label>
              <label className={styles.field}>
                Email
                <input required type="email" maxLength={254} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </label>
              <label className={styles.consentRow}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{GIA_CONSENT_CHECKBOX}</span>
              </label>
              <div className={styles.cardActions}>
                <button type="submit" className={styles.save} disabled={!canSave}>
                  {GIA_CONSENT_SAVE}
                </button>
                <button type="button" className={styles.ghost} onClick={() => setShowConsent(false)}>
                  Not now
                </button>
                {!consent && <span className={styles.hint}>Tick consent to save</span>}
              </div>
            </form>
          )}
          {saved && !stopped && (
            <RegisterWithRecruiter
              cta={resolveRecruiterCta({
                consented: true,
                program,
                defaultUrl: defaultRecruiter?.url,
                defaultName: defaultRecruiter?.name,
              })}
              contact={contact}
            />
          )}
          {needOtp && saved && !stopped && (
            <form
              className={styles.card}
              onSubmit={(e) => {
                e.preventDefault();
                if (otp.trim()) void call('get_my_status', { otp: otp.trim() });
              }}
            >
              <p>Enter the mock verification code issued to your saved contact. This adapter never sends SMS or email.</p>
              <label className={styles.field}>
                Mock verification code
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
              </label>
              <button type="submit" className={styles.save} disabled={busy || otp.trim().length !== 6}>
                Verify and show my status
              </button>
            </form>
          )}
          {program === 'recruit' &&
            sessions.map((s) => (
              <article key={s.id} className={styles.session}>
                <p>
                  {new Date(s.starts_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Manila · {s.seats_left} seats
                </p>
                <button
                  type="button"
                  className={styles.save}
                  disabled={!saved || busy || stopped || s.seats_left < 1}
                  onClick={() => { void call('book_fep', { sessionId: s.id }); }}
                >
                  Book this FEP
                </button>
              </article>
            ))}
        </div>
      </div>
      <div className={styles.composerWrap}>
        {stuck && (
          <button type="button" className={styles.newMsg} onClick={() => { setStuck(false); scrollToEnd(); }}>
            ↓ New message
          </button>
        )}
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || busy || stopped) return;
            const value = text.trim();
            setText('');
            sendMapped(value);
          }}
        >
          <textarea
            aria-label="Message GIA"
            placeholder="Message GIA…"
            maxLength={1000}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onComposerKey}
          />
          <button type="submit" className={styles.send} disabled={busy || stopped || !text.trim()} aria-label="Send">
            <SendIcon />
          </button>
        </form>
      </div>
      <footer className={styles.footer}>
        <p>{GIA_DISCLAIMER}</p>
        <p>
          {GIA_FOOTER_LINE2_PREFIX}
          <a href="/gia/privacy">Privacy notice</a>
        </p>
      </footer>
    </div>
  );
}

function GiaText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <p>
      {parts.map((part, i) =>
        part.startsWith('https://') ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function ProgramPicker({
  program,
  onChange,
  labelledBy,
}: {
  program: Program;
  onChange: (next: Program) => void;
  labelledBy?: string;
}) {
  const ids: Program[] = ['recruit', 'intern', 'ra'];
  return (
    <div className={styles.seg} role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Which 1CMA program should GIA guide?'}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className={styles.segBtn}
          role="radio"
          aria-checked={program === id}
          onClick={() => onChange(id)}
        >
          {id === 'recruit' ? 'Recruit' : id === 'intern' ? 'Intern' : 'RA'}
        </button>
      ))}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 14.3A8.5 8.5 0 1 1 9.7 3 7 7 0 0 0 21 14.3z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.6 21 12 3.4 3.4l.1 6.6L15 12 3.5 14z" />
    </svg>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GiaChat } from '@/components/gia/GiaChat';
import { GiaAvatar } from '@/components/gia/GiaAvatar';
import type { RecruiterRegistration } from '@/lib/gia/recruiter-registration';
import styles from './spike-preview.module.css';

function Icon({ kind }: { kind: 'moon' | 'sun' | 'send' | 'spike' | 'book' }) {
  return (
    <svg viewBox="0 0 24 24" fill={kind === 'spike' ? 'currentColor' : 'none'} stroke={kind === 'spike' ? 'none' : 'currentColor'} strokeWidth={kind === 'send' ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'moon' && <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />}
      {kind === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 3v1.5M12 19.5V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.5M19.5 12H21M4.9 19.1 6 18M18 6l1.1-1.1" /></>}
      {kind === 'send' && <path d="M5 12h14M13 6l6 6-6 6" />}
      {kind === 'book' && <><path d="M12 6c2.2-1.4 5.2-1.8 9-1.2v12.4c-3.6-.5-6.3.1-9 1.3C9.3 17.3 6.6 16.7 3 17.2V4.8C6.8 4.2 9.8 4.6 12 6z" /><path d="M12 6v12.5" /></>}
      {kind === 'spike' && <g transform="translate(12 12)"><rect x="-1.15" y="-9" width="2.3" height="18" rx="0.35" /><rect x="-9" y="-1.15" width="18" height="2.3" rx="0.35" /><g transform="rotate(45)"><rect x="-1.15" y="-9" width="2.3" height="18" rx="0.35" /><rect x="-9" y="-1.15" width="18" height="2.3" rx="0.35" /></g><circle r="1.7" fill="var(--icon-bg)" /></g>}
    </svg>
  );
}

export function SpikePreviewLanding({ fontClass, defaultRecruiter = null }: {
  fontClass?: string;
  defaultRecruiter?: RecruiterRegistration | null;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [giaOpen, setGiaOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; id: number }>();
  const [draft, setDraft] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const dock = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!giaOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dock.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGiaOpen(false);
      if (event.key === 'Tab') {
        const elements = Array.from(dock.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', escape);
      returnFocus.current?.focus();
    };
  }, [giaOpen]);

  function openGia(text?: string) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSeed(text ? { text, id: Date.now() } : undefined);
    setGiaOpen(true);
  }
  function onAsk(event: FormEvent) {
    event.preventDefault();
    openGia(draft.trim() || undefined);
    setDraft('');
  }

  return <>
    <div className={`${styles.root} ${fontClass ?? ''}`} data-theme={theme} inert={giaOpen}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header>
        <div className={styles.brands}>
          <Image className={styles['logo-spike']} src={`/spike-preview/spike-logo${theme === 'light' ? '-navy' : ''}.png`} alt="SPIKE" width={171} height={36} priority unoptimized />
          <Image className={styles['logo-1cma']} src={`/spike-preview/1cma-logo${theme === 'light' ? '-navy' : ''}.png`} alt="1CMA" width={67} height={58} priority unoptimized />
        </div>
        <button className={styles['theme-toggle']} type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          <Icon kind={theme === 'light' ? 'moon' : 'sun'} />
        </button>
      </header>
      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title" data-testid="gia-hero">
          <div className={styles['hero-photo']}>
            <Image src="/spike-preview/gia-hero.webp" alt="GIA, your 1CMA AI guide" fill priority unoptimized sizes="(max-width: 900px) calc(100vw - 32px), 542px" />
          </div>
          <div className={styles['hero-copy']}>
            <h1 id="hero-title">Ask GIA. Start free.</h1>
            <p className={styles.lede}>Your 1CMA guide to growing into a financial entrepreneur.</p>
            <form className={styles.ask} onSubmit={onAsk} aria-label="Ask GIA">
              <input name="q" placeholder="Ask GIA…" autoComplete="off" aria-label="Message GIA" maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} />
              <button className={styles.send} type="submit" aria-label="Send to GIA"><Icon kind="send" /></button>
            </form>
          </div>
        </section>
        <section className={styles.options} aria-label="Explore with GIA">
          <button className={styles.option} type="button" onClick={() => openGia('What is SPIKE?')}>
            <span className={styles.icon}><Icon kind="spike" /></span>
            <span className={styles['option-text']}><span className={styles.optionTitle}>What is SPIKE?</span><span className={styles.optionCaption}>Hear it from GIA</span></span>
          </button>
          <button className={styles.option} type="button" onClick={() => openGia('is financial literacy free')}>
            <span className={styles.icon}><Icon kind="book" /></span>
            <span className={styles['option-text']}><span className={styles.optionTitle}>Free Financial Literacy</span><span className={styles.optionCaption}>Start learning, free</span></span>
          </button>
          <button className={styles.option} type="button" onClick={() => openGia()}>
            <span className={styles.icon}><GiaAvatar className={styles.cardAvatar} /></span>
            <span className={styles['option-text']}><span className={styles.optionTitle}>Talk to GIA</span><span className={styles.optionCaption}>Ask anything, anytime</span></span>
          </button>
        </section>
      </main>
      <footer><a href="/gia/privacy">Privacy notice</a>{' · Reply STOP to opt out'}</footer>
    </div>
    {giaOpen && createPortal(
      <div ref={dock} className={styles.giaDock} role="dialog" aria-modal="true" aria-label="GIA guide">
        <div className={styles.giaDockInner}>
          <GiaChat variant="panel" seed={seed} defaultRecruiter={defaultRecruiter} onClose={() => { setGiaOpen(false); setSeed(undefined); }} />
        </div>
      </div>, document.body,
    )}
  </>;
}

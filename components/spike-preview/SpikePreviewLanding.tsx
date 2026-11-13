'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GiaChat } from '@/components/gia/GiaChat';
import {
  FEP_INVITE,
  GIA_DISCLAIMER,
  GIA_JTBD,
  LITERACY_INVITE,
} from '@/lib/gia/ui-copy';
import styles from './spike-preview.module.css';

const AUDIENCES = {
  professional: {
    title: 'Build on what you already know.',
    description:
      'Explore how your professional experience could support a new learning and career direction, while asking practical questions about the transition.',
  },
  parent: {
    title: 'Keep family priorities in the conversation.',
    description: 'Ask practical questions about time, participation and the financial entrepreneurship pathway before you decide.',
  },
  student: {
    title: 'Start with curiosity, not a career commitment.',
    description: 'Explore financial knowledge and professional development as you prepare for life after school. Education is not a license.',
  },
} as const;

const REFLECT_COPY = {
  preview: 'A short free Financial Entrepreneurship Preview is a fit to start. GIA can show FEP sessions after you consent.',
  literacy: 'Free Financial Literacy is a fit to start. GIA can walk you through the invitation after you ask.',
  pathway: 'Level-Up Financial Entrepreneurship is not live yet. Start with literacy or the free FEP preview, then talk to a 1CMA leader.',
} as const;

export function SpikePreviewLanding({ fontClass }: { fontClass?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [giaOpen, setGiaOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; id: number } | undefined>();
  const [draft, setDraft] = useState('');
  const [introOpen, setIntroOpen] = useState(false);
  const [audience, setAudience] = useState<keyof typeof AUDIENCES>('professional');
  const [reflect, setReflect] = useState<{ goal: string; interest: string; pace: string }>({
    goal: '',
    interest: '',
    pace: '',
  });
  const [reflectResult, setReflectResult] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  function openGia(next?: string) {
    setGiaOpen(true);
    if (next) setSeed({ text: next, id: Date.now() });
  }

  function onAsk(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    setDraft('');
    openGia(value || undefined);
  }

  function onReflect(e: FormEvent) {
    e.preventDefault();
    const answers = [reflect.goal, reflect.interest, reflect.pace];
    if (answers.some((a) => !['preview', 'literacy', 'pathway'].includes(a))) return;
    const counts = { preview: 0, literacy: 0, pathway: 0 };
    for (const a of answers) counts[a as keyof typeof counts]++;
    const maximum = Math.max(...Object.values(counts));
    const winners = (Object.keys(counts) as Array<keyof typeof counts>).filter((k) => counts[k] === maximum);
    const invitation = winners.length === 1 ? winners[0] : 'preview';
    setReflectResult(REFLECT_COPY[invitation]);
  }

  return (
    <div className={`${styles.root} ${fontClass ?? ''}`} data-theme={theme}>
      <a className={styles['skip-link']} href="#main">
        Skip to content
      </a>
      <div className={styles['review-banner']}>
        SPIKE × Versa visitor preview · Synthetic details only · No live applications · Not a signup form
      </div>
      <header className={`${styles['site-header']} ${styles.wrap}`}>
        <a className={styles.brand} href="#main" aria-label="SPIKE NEXT home">
          <span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.spikeMark}
              src="/spike-preview/spike-logo.png"
              alt="SPIKE Venture Studio"
              width={110}
              height={46}
              fetchPriority="high"
              decoding="async"
            />
          </span>
          <span className={styles['brand-next']}>NEXT</span>
        </a>
        <div className={styles['header-cma']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.cmaMark}
            src="/spike-preview/1cma-logo.png"
            alt="1 Matunog District · 1CMA"
            width={48}
            height={48}
            fetchPriority="high"
            decoding="async"
          />
          <span>
            1 MATUNOG DISTRICT<small>1CMA · AIA Philippines</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          <a href="#invitations">Start here</a>
          <a href="#more">More</a>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" className={`${styles.primary} ${styles.compact}`} onClick={() => openGia()}>
            Ask GIA
          </button>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <section className={`${styles.hero} ${styles.firstScreen}`} aria-labelledby="hero-title">
          <div className={styles['hero-grid']} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles['hero-copy']}`}>
            <p className={styles['hero-badge']}>
              SPIKE × Versa · <strong>1CMA</strong> in Cebu
            </p>
            <h1 id="hero-title">Ask GIA. Start free.</h1>
            <p className={styles.lede}>
              Free Financial Literacy and a free FEP preview. <span className={styles.nowrap}>Level-Up</span> is coming soon.
            </p>
            <form className={styles.askGia} onSubmit={onAsk} aria-label="Ask GIA">
              <input
                aria-label="Message GIA"
                placeholder="Ask GIA…"
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className={styles.askGiaSend} aria-label="Send to GIA">
                ↗
              </button>
            </form>
            <div className={styles.jtbd} aria-label="What do you want to do?">
              {GIA_JTBD.map((item) => (
                <button type="button" key={item.label} onClick={() => openGia(item.label)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div id="invitations" className={styles.inviteGrid}>
              <article className={styles.inviteCard}>
                <p className={styles.tag}>Free</p>
                <h2>Free Financial Literacy</h2>
                <p>Everyday money conversations. Ask GIA to start.</p>
                <button type="button" onClick={() => openGia(LITERACY_INVITE)}>
                  Ask GIA about literacy
                </button>
              </article>
              <article className={styles.inviteCard}>
                <p className={styles.tag}>Free · Direct entry allowed</p>
                <h2>Free Financial Entrepreneurship Preview</h2>
                <p>A first look at the path. You do not need literacy first.</p>
                <button type="button" onClick={() => openGia(FEP_INVITE)}>
                  Ask GIA about FEP
                </button>
              </article>
              <article className={`${styles.inviteCard} ${styles.comingSoon}`}>
                <p className={styles.tag}>Coming soon</p>
                <h2>Level-Up Financial Entrepreneurship</h2>
                <p>Not live. This card does not collect applications.</p>
                <button type="button" disabled>
                  Coming soon · not live
                </button>
              </article>
            </div>
          </div>
        </section>

        <section id="more" className={`${styles.section} ${styles.wrap} ${styles.folded}`}>
          <details>
            <summary>Watch the intro</summary>
            <p>Approved SPIKE NEXT / 1CMA footage will replace this placeholder. Nothing plays until you open it.</p>
            <button type="button" className={styles['watch-button']} onClick={() => setIntroOpen(true)}>
              <span aria-hidden="true">▷</span> Watch the Intro Reel
            </button>
          </details>
          <details>
            <summary>Who this is for</summary>
            <div className={styles['audience-choices']} role="group" aria-label="Your current chapter">
              <button type="button" aria-pressed={audience === 'professional'} onClick={() => setAudience('professional')}>
                Professional
              </button>
              <button type="button" aria-pressed={audience === 'parent'} onClick={() => setAudience('parent')}>
                Family
              </button>
              <button type="button" aria-pressed={audience === 'student'} onClick={() => setAudience('student')}>
                Student
              </button>
            </div>
            <div className={styles['audience-copy']} aria-live="polite">
              <h3>{AUDIENCES[audience].title}</h3>
              <p>{AUDIENCES[audience].description}</p>
              <button type="button" className={styles.quiet} onClick={() => openGia(audience === 'student' ? GIA_JTBD[2].label : FEP_INVITE)}>
                Ask GIA about this track →
              </button>
            </div>
            <p className={styles.safeguard}>
              <strong>Student regulatory safeguard:</strong> Education and simulation do not authorize insurance advisory activity. Regulated advisory activity requires applicable Insurance Commission licensing and accreditation.
            </p>
          </details>
          <details>
            <summary>Optional starting-point questions</summary>
            <p>Choose your preferences to explore a starting invitation. This is not a career assessment, and no contact details are collected.</p>
            <form onSubmit={onReflect}>
              <fieldset>
                <legend>1. What would help you most right now?</legend>
                <label>
                  <input required type="radio" name="goal" value="preview" onChange={(e) => setReflect({ ...reflect, goal: e.target.value })} /> Understand a new career direction
                </label>
                <label>
                  <input type="radio" name="goal" value="literacy" onChange={(e) => setReflect({ ...reflect, goal: e.target.value })} /> Grow my financial knowledge
                </label>
                <label>
                  <input type="radio" name="goal" value="pathway" onChange={(e) => setReflect({ ...reflect, goal: e.target.value })} /> Develop through structured learning
                </label>
              </fieldset>
              <fieldset>
                <legend>2. What would you like to explore first?</legend>
                <label>
                  <input required type="radio" name="interest" value="preview" onChange={(e) => setReflect({ ...reflect, interest: e.target.value })} /> The financial entrepreneur role
                </label>
                <label>
                  <input type="radio" name="interest" value="literacy" onChange={(e) => setReflect({ ...reflect, interest: e.target.value })} /> Everyday money decisions
                </label>
                <label>
                  <input type="radio" name="interest" value="pathway" onChange={(e) => setReflect({ ...reflect, interest: e.target.value })} /> An integrated development program
                </label>
              </fieldset>
              <fieldset>
                <legend>3. What kind of next step suits you?</legend>
                <label>
                  <input required type="radio" name="pace" value="preview" onChange={(e) => setReflect({ ...reflect, pace: e.target.value })} /> A short introduction
                </label>
                <label>
                  <input type="radio" name="pace" value="literacy" onChange={(e) => setReflect({ ...reflect, pace: e.target.value })} /> A focused literacy session
                </label>
                <label>
                  <input type="radio" name="pace" value="pathway" onChange={(e) => setReflect({ ...reflect, pace: e.target.value })} /> A conversation about ongoing learning
                </label>
              </fieldset>
              <button className={styles.primary} type="submit">
                See my starting point
              </button>
              <div className={styles.result} role="status">
                {reflectResult}
              </div>
              {reflectResult && !reflectResult.includes('not live') && (
                <button type="button" className={styles.primary} onClick={() => openGia(reflectResult.includes('Literacy') ? LITERACY_INVITE : FEP_INVITE)}>
                  Continue with GIA
                </button>
              )}
            </form>
          </details>
          <details id="pathway">
            <summary>The SPIKE pathway</summary>
            <p>Discovery, guided learning, professional readiness and continued development. Explore without committing to a career.</p>
            <div className={styles.pathway}>
              <details>
                <summary>
                  <span>01</span> Discover · Assessment
                </summary>
                <p>Begin with a preview or literacy session. Bring your goals, experience and questions.</p>
              </details>
              <details>
                <summary>
                  <span>02</span> Explore · Foundation
                </summary>
                <p>Discuss the integrated Financial Entrepreneurship Program, learning format and which entry point fits your interests.</p>
              </details>
              <details>
                <summary>
                  <span>03</span> Develop · Regulatory readiness
                </summary>
                <p>Build financial knowledge, ethics and professional skills. Discuss licensing preparation; participation does not confer a license.</p>
              </details>
              <details>
                <summary>
                  <span>04</span> Build · Professional practice
                </summary>
                <p>Explore applied activities and feedback with the program team. Availability needs confirmation.</p>
              </details>
              <details>
                <summary>
                  <span>05</span> Lead · Leadership development
                </summary>
                <p>Advancement depends on readiness, performance, regulatory requirements and available opportunities; no appointment or income is guaranteed.</p>
              </details>
              <details>
                <summary>
                  <span>06</span> Enterprise · Continued growth
                </summary>
                <p>Make an informed decision with the team about continued development and any formal application process.</p>
              </details>
            </div>
          </details>
          <details>
            <summary>SPIKE × Versa</summary>
            <p>
              Explore this preview from your phone or desktop. Versa owns the future signup and issued-code handoff; this preview does not invent that channel or create portal accounts.
            </p>
            <ul>
              <li>Visible GIA guide using the existing 1CMA role-scoped API</li>
              <li>Consented capture and FEP booking stay on the existing backend</li>
              <li>No silent capture, no DOB, address or ID on this landing</li>
            </ul>
          </details>
          <details>
            <summary>1CMA in Cebu</summary>
            <div className={styles['agency-art']}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.agencyMark}
                src="/spike-preview/1cma-logo.png"
                alt="1 Matunog District"
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
              />
            </div>
            <p>Learn about the financial entrepreneur journey with 1CMA / AIA Philippines Cebu. Bring questions about learning and career requirements.</p>
            <button type="button" className={styles.primary} onClick={() => openGia(FEP_INVITE)}>
              Ask GIA about the Cebu preview
            </button>
          </details>
        </section>
      </main>
      <footer className={styles.wrap}>
        <div>
          <span className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.spikeMarkSm}
              src="/spike-preview/spike-logo.png"
              alt="SPIKE Venture Studio"
              width={75}
              height={26}
              loading="lazy"
              decoding="async"
            />
            <span className={styles['brand-next']}>NEXT</span>
          </span>
          <p>
            Learning with SPIKE / RA-SPIKE.
            <br />
            Career exploration with 1CMA / AIA Philippines Cebu.
          </p>
        </div>
        <div>
          <span className={styles.powered}>
            Powered by{' '}
            <span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.versaMark}
                src="/spike-preview/versa-logo.png"
                alt="Versa"
                width={75}
                height={32}
                loading="lazy"
                decoding="async"
              />
            </span>
          </span>
          <p className={styles.fine}>
            Visitor preview · No live applications
            <br />
            Privacy and final offer details pending approval.
          </p>
        </div>
      </footer>
      {!giaOpen && (
      <div className={styles.legalStrip} role="contentinfo">
        <p>{GIA_DISCLAIMER}</p>
        <p>
          <a href="/gia/privacy">Privacy notice</a>
          {' · '}
          <button type="button" className={styles.legalStop} onClick={() => openGia('STOP')}>
            STOP
          </button>
        </p>
      </div>
      )}
      {!giaOpen && (
        <button type="button" className={styles.giaFab} onClick={() => openGia()}>
          Ask GIA
        </button>
      )}
      {giaOpen && mounted && createPortal(
        <div className={styles.giaDock} role="dialog" aria-modal="true" aria-label="GIA guide">
          <div className={styles.giaDockInner}>
            <GiaChat variant="panel" seed={seed} onClose={() => { setGiaOpen(false); setSeed(undefined); }} />
          </div>
        </div>,
        document.body,
      )}
      {introOpen && (
        <dialog id="intro" open aria-labelledby="intro-title">
          <div className={styles['video-placeholder']}>
            <span aria-hidden="true">▷</span>
            <p>Introduction video placeholder</p>
            <small>Approved SPIKE NEXT / 1CMA footage will replace this.</small>
          </div>
          <div className={styles['intro-overlay-top']}>
            <p id="intro-title">Discover SPIKE NEXT</p>
            <button type="button" onClick={() => setIntroOpen(false)}>
              Close
            </button>
          </div>
          <div className={styles['intro-overlay-bottom']}>
            <button type="button" className={styles.primary} onClick={() => setIntroOpen(false)}>
              Explore →
            </button>
            <p>Explore at your own pace. GIA is optional. There is no signup on this preview.</p>
          </div>
        </dialog>
      )}
    </div>
  );
}

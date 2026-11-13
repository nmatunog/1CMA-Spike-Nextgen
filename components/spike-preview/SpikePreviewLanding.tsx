'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GiaChat } from '@/components/gia/GiaChat';
import { FEP_INVITE, LITERACY_INVITE } from '@/lib/gia/ui-copy';
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
  const [prompt, setPrompt] = useState<string | undefined>();
  const [introOpen, setIntroOpen] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [audience, setAudience] = useState<keyof typeof AUDIENCES>('professional');
  const [reflect, setReflect] = useState<{ goal: string; interest: string; pace: string }>({
    goal: '',
    interest: '',
    pace: '',
  });
  const [reflectResult, setReflectResult] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const promptKey = useMemo(() => (giaOpen ? prompt ?? '' : ''), [giaOpen, prompt]);
  useEffect(() => { setMounted(true); }, []);

  function openGia(next?: string) {
    setPrompt(next);
    setGiaOpen(true);
    setSuggest(false);
  }

  function closeIntro() {
    setIntroOpen(false);
    setSuggest(true);
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
            <img className={styles.spikeMark} src="/spike-preview/spike-logo.png" alt="SPIKE Venture Studio" width={150} height={64} />
          </span>
          <span className={styles['brand-next']}>NEXT</span>
        </a>
        <div className={styles['header-cma']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.cmaMark} src="/spike-preview/1cma-logo.png" alt="1 Matunog District · 1CMA" width={70} height={70} />
          <span>
            1 MATUNOG DISTRICT<small>1CMA · AIA Philippines</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          <a href="#invitations">Start here</a>
          <a href="#pathway">The pathway</a>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" className={`${styles.primary} ${styles.compact}`} onClick={() => openGia(FEP_INVITE)}>
            Join Free Preview <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </header>
      {suggest && (
        <aside className={`${styles.wrap} ${styles['signup-suggestion']}`} aria-labelledby="suggestion-title">
          <div>
            <h2 id="suggestion-title">Talk with GIA, or look around first?</h2>
            <p>GIA is the 1CMA guide for free literacy, the free FEP preview, and a leader request. No fake signup.</p>
          </div>
          <div className={styles['suggestion-actions']}>
            <button type="button" className={styles.primary} onClick={() => openGia()}>
              Ask GIA
            </button>
            <button type="button" onClick={() => setSuggest(false)}>
              Not now
            </button>
          </div>
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles['hero-grid']} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles['hero-copy']}`}>
            <p className={styles['hero-badge']}>
              Incubation gateway of <strong>1 Matunog District</strong> · AIA Philippines
            </p>
            <h1 id="hero-title">
              Build Your Enterprise.
              <br />
              <em>Own Your Future.</em>
            </h1>
            <p className={styles.lede}>
              Discover financial entrepreneurship with 1CMA in Cebu. Start with a free preview, build your financial knowledge, and explore your next career step through <strong>The SPIKE Method.</strong>
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => openGia(FEP_INVITE)}>
                Join the Free Preview <span aria-hidden="true">→</span>
              </button>
              <button type="button" className={styles['watch-button']} onClick={() => setIntroOpen(true)}>
                <span aria-hidden="true">▷</span> Watch the Intro Reel
              </button>
            </div>
            <div className={styles['hero-facts']} aria-label="Your starting journey">
              <article className={styles['hero-benefit']}>
                <div className={styles['benefit-kicker']}>
                  <span aria-hidden="true">01</span> Start free
                </div>
                <h2>
                  Explore the <br />
                  opportunity.
                </h2>
                <p>
                  Join the Financial Entrepreneur Preview with <strong>₱0 registration fee</strong>. Discover the journey before deciding.
                </p>
              </article>
              <article className={styles['hero-benefit']}>
                <div className={styles['benefit-kicker']}>
                  <span aria-hidden="true">02</span> Develop with purpose
                </div>
                <h2>
                  Learn through <br />
                  SPIKE / RA-SPIKE.
                </h2>
                <p>An integrated development pathway from learning to professional practice and leadership.</p>
              </article>
              <article className={styles['hero-benefit']}>
                <div className={styles['benefit-kicker']}>
                  <span aria-hidden="true">03</span> Connect in Cebu
                </div>
                <h2>
                  Explore with <br />
                  1CMA.
                </h2>
                <p>Get to know Cebu Matunog Agency and the financial entrepreneurship pathway.</p>
              </article>
            </div>
            <button type="button" className={styles['media-note']} aria-label="Open introduction video" onClick={() => setIntroOpen(true)}>
              ▷ Introduction video placeholder · Explore without watching
            </button>
          </div>
        </section>

        <section id="invitations" className={`${styles.section} ${styles.wrap}`}>
          <div className={styles['section-head']}>
            <div>
              <p className={styles.eyebrow}>Your first step is free</p>
              <h2>Explore. Learn. Grow.</h2>
            </div>
            <p>No need to decide on a new career today. Start by discovering the opportunity and building your financial knowledge.</p>
          </div>
          <div className={styles.cards}>
            <article className={styles.card}>
              <span className={styles.number}>01</span>
              <p className={styles.tag}>Learn · Free entry</p>
              <h3>Attend Free Financial Literacy Sessions</h3>
              <p>Start with everyday money conversations and explore habits for more informed financial decisions.</p>
              <button type="button" onClick={() => openGia(LITERACY_INVITE)}>
                Ask GIA about literacy <span aria-hidden="true">↗</span>
              </button>
            </article>
            <article className={styles.card}>
              <span className={styles.number}>02</span>
              <p className={styles.tag}>Explore · Free entry · Direct entry allowed</p>
              <h3>Join the Free Financial Entrepreneurship Preview</h3>
              <p>Get a first look at financial entrepreneurship and bring your questions about the journey. You can enter FEP without finishing literacy first.</p>
              <button type="button" onClick={() => openGia(FEP_INVITE)}>
                Ask GIA about FEP <span aria-hidden="true">↗</span>
              </button>
            </article>
            <article className={`${styles.card} ${styles.featured} ${styles.comingSoon}`}>
              <span className={styles.number}>03</span>
              <p className={styles.tag}>Develop · Coming soon · Not live</p>
              <h3>Level-Up Financial Entrepreneurship</h3>
              <p>
                The paid L2 pathway is not live. Licensing is a required gate before regulated advisory work. Ask a 1CMA leader when it opens; this card does not collect applications.
              </p>
              <button type="button" disabled>
                Coming soon · not live
              </button>
            </article>
          </div>
          <p className={styles.fine}>
            Free entry describes literacy and the FEP preview. Program eligibility, schedules, any later costs and licensing requirements must be confirmed with the team. GIA never creates access codes and never treats payment as verified.
          </p>
        </section>

        <section id="audiences" className={styles['audience-section']}>
          <div className={`${styles.section} ${styles.wrap}`}>
            <div className={styles['center-heading']}>
              <p className={styles.eyebrow}>Specialized cohort lanes</p>
              <h2>Tailored for Ambitious Builders</h2>
              <p>Explore a development pathway around your life stage, experience and interests.</p>
            </div>
            <div className={styles['audience-choices']} role="group" aria-label="Your current chapter">
              <article className={styles.lane}>
                <div className={`${styles['lane-visual']} ${styles.corporate}`}>
                  <span>01 / Corporate pivot</span>
                  <strong>
                    Experience.
                    <br />
                    Reimagined.
                  </strong>
                  <small>Audience media placeholder</small>
                </div>
                <div className={styles['lane-copy']}>
                  <p className={styles.eyebrow}>Lane 01 · Corporate pivot</p>
                  <h3>Gen Y / Mid-Career</h3>
                  <p>Build on your professional experience while exploring a new direction in financial entrepreneurship.</p>
                  <ul>
                    <li>Explore transferable skills</li>
                    <li>Discuss the learning commitment</li>
                  </ul>
                  <button type="button" aria-pressed={audience === 'professional'} onClick={() => setAudience('professional')}>
                    Select professional track
                  </button>
                </div>
              </article>
              <article className={styles.lane}>
                <div className={`${styles['lane-visual']} ${styles.family}`}>
                  <span>02 / Family enterprise</span>
                  <strong>
                    Purpose.
                    <br />
                    Together.
                  </strong>
                  <small>Audience media placeholder</small>
                </div>
                <div className={styles['lane-copy']}>
                  <p className={styles.eyebrow}>Lane 02 · Family enterprise</p>
                  <h3>Couples &amp; Parents</h3>
                  <p>Explore career possibilities with your family priorities in mind. Ask practical questions before deciding.</p>
                  <ul>
                    <li>Discuss family and time priorities</li>
                    <li>Understand participation requirements</li>
                  </ul>
                  <button type="button" aria-pressed={audience === 'parent'} onClick={() => setAudience('parent')}>
                    Select family track
                  </button>
                </div>
              </article>
              <article className={styles.lane}>
                <div className={`${styles['lane-visual']} ${styles.student}`}>
                  <span>03 / Launchpad</span>
                  <strong>
                    Curiosity.
                    <br />
                    In motion.
                  </strong>
                  <small>Audience media placeholder</small>
                </div>
                <div className={styles['lane-copy']}>
                  <p className={styles.eyebrow}>Lane 03 · Launchpad</p>
                  <h3>Gen Z &amp; Senior Students</h3>
                  <p>Explore financial knowledge and professional development as you prepare for life after school.</p>
                  <ul>
                    <li>Discover the learning pathway</li>
                    <li>Understand eligibility and licensing</li>
                  </ul>
                  <button type="button" aria-pressed={audience === 'student'} onClick={() => setAudience('student')}>
                    Select student track
                  </button>
                </div>
              </article>
            </div>
            <div className={styles['audience-copy']} aria-live="polite">
              <h3>{AUDIENCES[audience].title}</h3>
              <p>{AUDIENCES[audience].description}</p>
              <button type="button" className={styles.quiet} onClick={() => openGia(FEP_INVITE)}>
                Explore my selected track with GIA →
              </button>
            </div>
            <p className={styles.safeguard}>
              <strong>Student regulatory safeguard:</strong> Education and simulation do not authorize insurance advisory activity. Regulated advisory activity requires applicable Insurance Commission licensing and accreditation.
            </p>
          </div>
        </section>

        <section id="reflection" className={`${styles.section} ${styles.wrap} ${styles.reflection}`}>
          <div>
            <p className={styles.eyebrow}>Interactive preference guide · Optional</p>
            <h2>Find Your Starting Pathway</h2>
            <p>Choose your preferences to explore a starting invitation. This is not a career assessment, and no contact details are collected.</p>
          </div>
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
              See my starting point <span aria-hidden="true">↗</span>
            </button>
            <div className={styles.result} role="status">
              {reflectResult}
            </div>
            {reflectResult && !reflectResult.includes('not live') && (
              <button type="button" className={styles.primary} onClick={() => openGia(reflectResult.includes('Literacy') ? LITERACY_INVITE : FEP_INVITE)}>
                Continue with GIA ↗
              </button>
            )}
          </form>
        </section>

        <section id="pathway" className={`${styles.section} ${styles.wrap}`}>
          <div className={styles['section-head']}>
            <div>
              <p className={styles.eyebrow}>GIYA Institute · SPIKE / RA-SPIKE integrated program</p>
              <h2>Your Path to Financial Entrepreneurship</h2>
            </div>
            <p>The integrated SPIKE Method and RA-SPIKE Rookie Academy pathway connects discovery, guided learning, professional readiness and continued development. Explore the stages without committing to a career.</p>
          </div>
          <div className={styles.pathway}>
            <details open>
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
              <p>Build financial knowledge, ethics and professional skills. Discuss licensing preparation and applicable accreditation requirements; participation does not confer a license.</p>
            </details>
            <details>
              <summary>
                <span>04</span> Build · Professional practice
              </summary>
              <p>Explore applied activities and feedback with the program team. Availability and participation requirements need confirmation.</p>
            </details>
            <details>
              <summary>
                <span>05</span> Lead · Leadership development
              </summary>
              <p>Explore mentoring and leadership development with the team. Advancement depends on readiness, performance, regulatory requirements and available opportunities; no appointment or income is guaranteed.</p>
            </details>
            <details>
              <summary>
                <span>06</span> Enterprise · Continued growth
              </summary>
              <p>Make an informed decision with the team about continued development and any formal application process.</p>
            </details>
          </div>
        </section>

        <section id="ecosystem" className={`${styles.section} ${styles.wrap} ${styles['integration-section']}`}>
          <div>
            <p className={styles.eyebrow}>Technology collaboration</p>
            <h2>
              Built for a<br />
              mobile-first experience.
            </h2>
            <p>
              Explore this SPIKE × Versa preview from your phone or desktop. Versa owns the future signup and issued-code handoff; this preview does not invent that delivery channel or create portal accounts.
            </p>
            <ul>
              <li>Visible GIA guide using the existing 1CMA role-scoped API</li>
              <li>Consented capture and FEP booking stay on the existing backend</li>
              <li>No silent capture, no DOB, address or ID on this landing</li>
            </ul>
          </div>
          <aside className={styles['integration-card']}>
            <span className={styles['status-tag']}>Visitor preview</span>
            <h3>Your journey, clearly connected.</h3>
            <ol>
              <li>Choose literacy or the free FEP preview</li>
              <li>Talk with GIA</li>
              <li>Consent, then book or request a 1CMA leader</li>
            </ol>
            <p>Synthetic details only. Command Center remains operator-only.</p>
          </aside>
        </section>

        <section id="cma" className={styles['agency-section']}>
          <div className={`${styles.wrap} ${styles['agency-layout']}`}>
            <div className={styles['agency-art']}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.agencyMark} src="/spike-preview/1cma-logo.png" alt="1 Matunog District" width={160} height={160} />
              <span>Cebu City · AIA Philippines</span>
            </div>
            <div>
              <p className={styles.eyebrow}>1 Matunog District · Cebu Matunog Agency</p>
              <h2>
                Explore Your Next Chapter
                <br />
                with 1CMA in Cebu.
              </h2>
              <p>Learn about the financial entrepreneur journey and the integrated SPIKE / RA-SPIKE development pathway. Bring your questions about learning, professional readiness and the career requirements.</p>
              <button type="button" className={styles.primary} onClick={() => openGia(FEP_INVITE)}>
                Explore the Cebu preview with GIA →
              </button>
            </div>
          </div>
        </section>

        <section className={`${styles.closing} ${styles.wrap}`}>
          <p className={styles.eyebrow}>Your next step starts with a free preview</p>
          <h2>Build What’s Next.</h2>
          <button type="button" className={styles.primary} onClick={() => openGia(FEP_INVITE)}>
            Join the Free Preview <span aria-hidden="true">↗</span>
          </button>
        </section>
      </main>
      <footer className={styles.wrap}>
        <div>
          <span className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.spikeMarkSm} src="/spike-preview/spike-logo.png" alt="SPIKE Venture Studio" width={75} height={26} />
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
              <img className={styles.versaMark} src="/spike-preview/versa-logo.png" alt="Versa" width={75} height={32} />
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
        <div className={styles['mobile-cta']}>
          <button type="button" className={styles.primary} onClick={() => openGia(FEP_INVITE)}>
            Explore my next step <span aria-hidden="true">↗</span>
          </button>
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
            <GiaChat key={promptKey} variant="panel" initialPrompt={prompt} onClose={() => { setGiaOpen(false); setPrompt(undefined); }} />
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
            <button type="button" onClick={closeIntro}>
              Close
            </button>
          </div>
          <div className={styles['intro-overlay-bottom']}>
            <button type="button" className={styles.primary} onClick={closeIntro}>
              Explore →
            </button>
            <p>Explore at your own pace. GIA is optional. There is no signup on this preview.</p>
          </div>
        </dialog>
      )}
    </div>
  );
}

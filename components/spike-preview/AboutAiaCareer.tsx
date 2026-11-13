import { AIA_CAREER_SECTIONS, AIA_SOURCE_AS_OF } from '@/lib/gia/aia-career-copy';
import styles from './spike-preview.module.css';

const PLACEHOLDERS = [
  { slot: 'Hero still', note: 'AIA career imagery — awaiting Nilo/AIA approval. Not downloaded.' },
  { slot: 'Story photo', note: 'Life Planner story photo — labelled placeholder only.' },
  { slot: 'Video', note: 'AIA video — no embed, no hotlink.' },
] as const;

export function AboutAiaCareer() {
  return (
    <section id="about-aia" className={styles.aboutAia} aria-labelledby="about-aia-title">
      <h2 id="about-aia-title">About the AIA advisor career</h2>
      <p className={styles.aboutLead}>
        Framed on this page from AIA Philippines public material. Paraphrased in our words. Not a Join or Register control.
      </p>
      <div className={styles.aboutPlaceholders}>
        {PLACEHOLDERS.map((item) => (
          <figure key={item.slot} className={styles.aboutPlaceholder} data-status="awaiting-approval">
            <span aria-hidden="true">{item.slot}</span>
            <figcaption>{item.note}</figcaption>
          </figure>
        ))}
      </div>
      {AIA_CAREER_SECTIONS.map((section) => (
        <article key={section.id} id={`about-aia-${section.id}`} className={styles.aboutSection}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          {section.sensitive ? <p className={styles.aboutSensitive}>{section.sensitive}</p> : null}
          <p className={styles.aboutSource}>
            Source: AIA Philippines, as of {AIA_SOURCE_AS_OF}.{' '}
            <a href={section.sourceUrl} rel="noopener noreferrer">
              {section.sourceLabel}
            </a>
          </p>
        </article>
      ))}
    </section>
  );
}

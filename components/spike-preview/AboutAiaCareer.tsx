import { AIA_CAREER_SECTIONS, AIA_SOURCE_AS_OF } from '@/lib/gia/aia-career-copy';
import styles from './spike-preview.module.css';

/** Visible labels only. Status and source URLs live in docs/aia-content/ASSETS.md. */
const PLACEHOLDERS = [
  { kind: 'photo', label: 'Photo coming soon' },
  { kind: 'photo', label: 'Photo coming soon' },
  { kind: 'video', label: 'Video coming soon' },
] as const;

export function AboutAiaCareer() {
  return (
    <section id="about-aia" className={styles.aboutAia} aria-labelledby="about-aia-title">
      <h2 id="about-aia-title">About the AIA advisor career</h2>
      <p className={styles.aboutLead}>Based on AIA Philippines&apos; public career information.</p>
      <div className={styles.aboutPlaceholders}>
        {PLACEHOLDERS.map((item, index) => (
          <figure key={`${item.kind}-${index}`} className={styles.aboutPlaceholder}>
            <span className={styles.aboutPlaceholderIcon} aria-hidden="true">
              {item.kind === 'video' ? '▶' : '▣'}
            </span>
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
      {AIA_CAREER_SECTIONS.map((section) => (
        <article key={section.id} id={`about-aia-${section.id}`} className={styles.aboutSection}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
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

'use client';

import { useState } from 'react';
import {
  aiaDetailDisplay,
  copyAllAiaDetails,
  detailsForAiaRegistration,
  type ConsentedContact,
} from '@/lib/gia/aia-registration-details';
import {
  RECRUITER_CTA_LABEL,
  RECRUITER_CTA_OPEN_NOTE,
  recruiterWithYouLine,
  type RecruiterCta,
} from '@/lib/gia/recruiter-registration';
import { visitorSafeHref } from '@/lib/gia/visitor-hrefs';
import styles from './register-with-recruiter.module.css';

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const node = document.createElement('textarea');
  node.value = value;
  node.setAttribute('readonly', '');
  node.style.position = 'fixed';
  node.style.left = '-9999px';
  document.body.appendChild(node);
  node.select();
  document.execCommand('copy');
  document.body.removeChild(node);
}

export function RegisterWithRecruiter({
  cta,
  contact,
}: {
  cta: RecruiterCta;
  contact: ConsentedContact | null;
}) {
  const rows = detailsForAiaRegistration(contact);
  const [copied, setCopied] = useState<string | null>(null);
  const withYou = cta.kind === 'cta' ? recruiterWithYouLine(cta.name) : null;
  const ctaHref = cta.kind === 'cta' ? visitorSafeHref(cta.url) : null;
  if (cta.kind === 'hidden') return null;

  async function onCopy(id: string, value: string) {
    await copyText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1600);
  }

  return (
    <section className={styles.wrap} aria-label={RECRUITER_CTA_LABEL} data-does-not-complete-registration="true">
      {cta.kind === 'waiting' || !ctaHref ? (
        <p className={styles.waiting}>{cta.kind === 'waiting' ? cta.label : RECRUITER_CTA_LABEL}</p>
      ) : (
        <div className={styles.ctaBlock}>
          {withYou ? <p className={styles.with}>{withYou}</p> : null}
          <a
            className={styles.cta}
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {cta.label}
          </a>
          <p className={styles.note}>{RECRUITER_CTA_OPEN_NOTE}</p>
        </div>
      )}
      {rows.length > 0 ? (
        <div className={styles.card} data-testid="aia-registration-details">
          <h2>Your details for AIA registration</h2>
          <p>Copy these into AIA’s form with your recruiter. You copy them yourself — we don’t send them to AIA.</p>
          <ul>
            {rows.map((row) => {
              const display = aiaDetailDisplay(row);
              return (
              <li key={row.id}>
                <div>
                  <span className={styles.label}>{row.label}</span>
                  <span className={styles.value}>{display.text}</span>
                  {!display.copyable && row.formatHint ? (
                    <span className={styles.hint}>{row.formatHint}</span>
                  ) : null}
                  {!display.copyable && row.options ? (
                    <span className={styles.hint}>{row.options.join(' / ')}</span>
                  ) : null}
                </div>
                {display.copyable ? (
                  <button type="button" onClick={() => onCopy(row.id, row.value)}>
                    {copied === row.id ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
              </li>
              );
            })}
          </ul>
          <button
            type="button"
            className={styles.copyAll}
            onClick={() => onCopy('all', copyAllAiaDetails(rows))}
          >
            {copied === 'all' ? 'Copied all' : 'Copy all'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

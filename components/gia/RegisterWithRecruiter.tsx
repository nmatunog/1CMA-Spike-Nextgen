'use client';

import { useState } from 'react';
import {
  copyAllAiaDetails,
  detailsForAiaRegistration,
  type ConsentedContact,
} from '@/lib/gia/aia-registration-details';
import { RECRUITER_CTA_LABEL, type RecruiterCta } from '@/lib/gia/recruiter-registration';
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
  if (cta.kind === 'hidden') return null;

  async function onCopy(id: string, value: string) {
    await copyText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1600);
  }

  return (
    <section className={styles.wrap} aria-label={RECRUITER_CTA_LABEL} data-does-not-complete-registration="true">
      {cta.kind === 'waiting' ? (
        <p className={styles.waiting}>{cta.label}</p>
      ) : (
        <div className={styles.ctaBlock}>
          {cta.name ? <p className={styles.with}>With {cta.name}</p> : null}
          <a
            className={styles.cta}
            href={cta.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {cta.label}
          </a>
          <p className={styles.note}>Opening this link never marks registration as done. SPIKE does not submit or confirm AIA applications.</p>
        </div>
      )}
      {rows.length > 0 ? (
        <div className={styles.card} data-testid="aia-registration-details">
          <h2>Your details for AIA registration</h2>
          <p>Copy these into AIA’s form with your recruiter. Nothing is sent to AIA from here. Client-side copy only.</p>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <span className={styles.label}>{row.label}</span>
                  <span className={styles.value}>{row.captured ? row.value : 'Not collected here'}</span>
                </div>
                <button type="button" disabled={!row.captured} onClick={() => onCopy(row.id, row.value)}>
                  {copied === row.id ? 'Copied' : 'Copy'}
                </button>
              </li>
            ))}
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

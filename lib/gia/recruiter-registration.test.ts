import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIA_REF_JOIN,
  AIA_REF_PARTNER,
  AIA_CAREER_SECTIONS,
} from './aia-career-copy';
import { AIA_ASSISTED_REGISTRATION_FIELDS } from '@/lib/mvp01/aia-assisted-fields';
import {
  SYNTHETIC_CONSENT_CONTACT,
  copyAllAiaDetails,
  detailsForAiaRegistration,
} from './aia-registration-details';
import {
  RECRUITER_CTA_LABEL,
  RECRUITER_WAITING_LABEL,
  SYNTHETIC_RECRUITER_DISPLAY_NAME,
  SYNTHETIC_RECRUITER_REFERENCE,
  SYNTHETIC_RECRUITER_REGISTRATION_URL,
  readDefaultRecruiterRegistration,
  recruiterDisplayName,
  resolveRecruiterCta,
  sanitizeAttributedRecruiterUrl,
} from './recruiter-registration';

describe('attributed recruiter registration URL', () => {
  it('accepts only https www.aia.com.ph join-us-now with a non-empty reference', () => {
    expect(sanitizeAttributedRecruiterUrl(SYNTHETIC_RECRUITER_REGISTRATION_URL)).toBe(
      SYNTHETIC_RECRUITER_REGISTRATION_URL,
    );
    expect(sanitizeAttributedRecruiterUrl(AIA_REF_JOIN)).toBeNull();
    expect(sanitizeAttributedRecruiterUrl(`${AIA_REF_JOIN}?reference=`)).toBeNull();
    expect(sanitizeAttributedRecruiterUrl(AIA_REF_PARTNER)).toBeNull();
    expect(sanitizeAttributedRecruiterUrl('http://www.aia.com.ph/en/financialadvisor/join-us-now?reference=abc')).toBeNull();
    expect(sanitizeAttributedRecruiterUrl('https://aia.com.ph/en/financialadvisor/join-us-now?reference=abc')).toBeNull();
    expect(sanitizeAttributedRecruiterUrl('https://www.aia.com.ph/en/financialadvisor/partner-with-the-best?reference=abc')).toBeNull();
    expect(
      sanitizeAttributedRecruiterUrl(
        `https://www.aia.com.ph/en/financialadvisor/join-us-now/?reference=${SYNTHETIC_RECRUITER_REFERENCE}`,
      ),
    ).toBe(`https://www.aia.com.ph/en/financialadvisor/join-us-now/?reference=${SYNTHETIC_RECRUITER_REFERENCE}`);
  });

  it('shows the recruiter display name and never the agent code', () => {
    expect(recruiterDisplayName(SYNTHETIC_RECRUITER_REGISTRATION_URL)).toBe(SYNTHETIC_RECRUITER_DISPLAY_NAME);
    expect(recruiterDisplayName(SYNTHETIC_RECRUITER_REGISTRATION_URL)).not.toMatch(/000000000/);
    expect(readDefaultRecruiterRegistration({})).toBeNull();
    expect(
      readDefaultRecruiterRegistration({
        AIA_DEFAULT_RECRUITER_REGISTRATION_URL: SYNTHETIC_RECRUITER_REGISTRATION_URL,
        AIA_DEFAULT_RECRUITER_DISPLAY_NAME: 'TEST/RECRUITER',
      }),
    ).toEqual({ url: SYNTHETIC_RECRUITER_REGISTRATION_URL, name: 'TEST/RECRUITER' });
  });

  it('hides the CTA until consent and never treats a click as done', () => {
    expect(resolveRecruiterCta({ consented: false, defaultUrl: SYNTHETIC_RECRUITER_REGISTRATION_URL })).toEqual({
      kind: 'hidden',
    });
    expect(resolveRecruiterCta({ consented: true, stopped: true, defaultUrl: SYNTHETIC_RECRUITER_REGISTRATION_URL })).toEqual({
      kind: 'hidden',
    });
    expect(resolveRecruiterCta({ consented: true, program: 'intern', defaultUrl: SYNTHETIC_RECRUITER_REGISTRATION_URL })).toEqual({
      kind: 'hidden',
    });
    expect(resolveRecruiterCta({ consented: true, program: 'recruit' })).toEqual({
      kind: 'waiting',
      label: RECRUITER_WAITING_LABEL,
    });
    expect(
      resolveRecruiterCta({
        consented: true,
        program: 'recruit',
        defaultUrl: SYNTHETIC_RECRUITER_REGISTRATION_URL,
        defaultName: 'TEST/RECRUITER',
      }),
    ).toEqual({
      kind: 'cta',
      label: RECRUITER_CTA_LABEL,
      url: SYNTHETIC_RECRUITER_REGISTRATION_URL,
      name: 'TEST/RECRUITER',
    });
  });
});

describe('AIA registration details card', () => {
  it('uses C1 shared field-order and only consented name/email on the landing', () => {
    expect(AIA_ASSISTED_REGISTRATION_FIELDS.map((f) => f.id)).toEqual([
      'first_name',
      'last_name',
      'email',
      'mobile',
      'city',
    ]);
    expect(JSON.stringify(AIA_ASSISTED_REGISTRATION_FIELDS)).not.toMatch(/dob|date of birth|passport|id number/i);
    const details = readFileSync('lib/gia/aia-registration-details.ts', 'utf8');
    expect(details).toContain("from '@/lib/mvp01/aia-assisted-fields'");
    const rows = detailsForAiaRegistration(SYNTHETIC_CONSENT_CONTACT);
    expect(rows.map((r) => r.id)).toEqual(AIA_ASSISTED_REGISTRATION_FIELDS.map((f) => f.id));
    expect(rows[0]).toMatchObject({ id: 'first_name', label: 'First name', value: 'Alex', captured: true });
    expect(rows[1]).toMatchObject({ id: 'last_name', label: 'Last name', value: 'Rivera', captured: true });
    expect(rows[2]).toMatchObject({ id: 'email', label: 'Email address', value: 'alex.rivera@example.test', captured: true });
    expect(rows[3]).toMatchObject({ id: 'mobile', value: '', captured: false });
    expect(rows[4]).toMatchObject({ id: 'city', value: '', captured: false });
    expect(copyAllAiaDetails(rows)).toBe(
      'First name: Alex\nLast name: Rivera\nEmail address: alex.rivera@example.test',
    );
    expect(detailsForAiaRegistration(null)).toEqual([]);
  });

  it('keeps career source links as reference, not as the CTA', () => {
    expect(AIA_CAREER_SECTIONS.every((s) => s.sourceLabel.includes('reference'))).toBe(true);
    expect(AIA_CAREER_SECTIONS.some((s) => /register|join us/i.test(s.sourceLabel))).toBe(false);
    expect(RECRUITER_CTA_LABEL).toBe('Register with your recruiter');
  });

  it('keeps the details card client-side with copy controls and no new PII', () => {
    const card = readFileSync('components/gia/RegisterWithRecruiter.tsx', 'utf8');
    expect(card).toContain('Your details for AIA registration');
    expect(card).toContain('Copy all');
    expect(card).toContain('data-does-not-complete-registration');
    expect(card).toContain('Nothing is sent to AIA from here');
    expect(card).not.toMatch(/date of birth|dateOfBirth|address|passport|national id/i);
    expect(card).not.toMatch(/fetch\(|XMLHttpRequest/);
    const about = readFileSync('components/spike-preview/AboutAiaCareer.tsx', 'utf8');
    expect(about).toContain('About the AIA advisor career');
    expect(about).toContain('awaiting Nilo/AIA approval');
    expect(about).toContain('section.sourceLabel');
  });
});

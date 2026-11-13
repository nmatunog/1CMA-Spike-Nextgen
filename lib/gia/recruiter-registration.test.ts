import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIA_REF_JOIN,
  AIA_REF_PARTNER,
  AIA_CAREER_SECTIONS,
} from './aia-career-copy';
import {
  AIA_ASK_ON_FORM,
  AIA_ASSISTED_REGISTRATION_FIELDS,
  AIA_MOBILE_FORMAT_HINT,
} from '@/lib/mvp01/aia-assisted-fields';
import {
  AIA_FORM_FILL_HINT,
  SYNTHETIC_CONSENT_CONTACT,
  aiaDetailDisplay,
  copyAllAiaDetails,
  detailsForAiaRegistration,
} from './aia-registration-details';
import {
  JOURNEY_STEP3_NOTE,
  RECRUITER_CTA_LABEL,
  RECRUITER_CTA_OPEN_NOTE,
  RECRUITER_WAITING_LABEL,
  SYNTHETIC_RECRUITER_DISPLAY_NAME,
  SYNTHETIC_RECRUITER_REFERENCE,
  SYNTHETIC_RECRUITER_REGISTRATION_URL,
  readDefaultRecruiterRegistration,
  recruiterDisplayName,
  recruiterWithYouLine,
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
    expect(JSON.stringify(AIA_ASSISTED_REGISTRATION_FIELDS)).not.toMatch(/password|credential|secret|pin|otp|agent.?code/i);
    const details = readFileSync('lib/gia/aia-registration-details.ts', 'utf8');
    expect(details).toContain("from '@/lib/mvp01/aia-assisted-fields'");
    expect(details).not.toMatch(/dateOfBirth|phone:/);
    const rows = detailsForAiaRegistration(SYNTHETIC_CONSENT_CONTACT);
    expect(rows.map((r) => r.id)).toEqual(AIA_ASSISTED_REGISTRATION_FIELDS.map((f) => f.id));
    const captured = rows.filter((row) => row.captured);
    expect(captured.map((row) => row.value)).toEqual(expect.arrayContaining(['Alex', 'Rivera', 'alex.rivera@example.test']));
    expect(captured.every((row) => !/dob|birth|honorific|city|applying|preferred|mobile/i.test(row.id))).toBe(true);
    for (const row of rows.filter((item) => !item.captured)) {
      expect(aiaDetailDisplay(row)).toEqual({ text: AIA_FORM_FILL_HINT, copyable: false });
      expect(aiaDetailDisplay(row).text).not.toBe(AIA_ASK_ON_FORM);
    }
    expect(rows.find((row) => row.id === 'mobile')?.formatHint).toBe(AIA_MOBILE_FORMAT_HINT);
    expect(copyAllAiaDetails(rows)).toContain('Alex');
    expect(copyAllAiaDetails(rows)).toContain('alex.rivera@example.test');
    expect(copyAllAiaDetails(rows)).not.toMatch(/You'll fill this in|ask the candidate/);
    expect(detailsForAiaRegistration(null)).toEqual([]);
    expect(readFileSync('components/spike-preview/SpikePreviewLanding.tsx', 'utf8')).not.toMatch(
      /type="date"|dateOfBirth|date of birth/i,
    );
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
    expect(card).toContain('aiaDetailDisplay');
    expect(card).toContain('recruiterWithYouLine');
    expect(card).toContain('RECRUITER_CTA_OPEN_NOTE');
    expect(card).not.toMatch(/Client-side copy only|Not collected here|awaiting Nilo|ask the candidate/);
    expect(card).toContain('row.formatHint');
    expect(card).toContain('row.options');
    expect(card).not.toMatch(/fetch\(|XMLHttpRequest/);
    expect(recruiterWithYouLine(SYNTHETIC_RECRUITER_DISPLAY_NAME)).toBe(
      "Your recruiter, TEST/RECRUITER, will be with you on AIA's form",
    );
    expect(RECRUITER_CTA_OPEN_NOTE).toBe("This opens AIA's official registration with your recruiter.");
    expect(JOURNEY_STEP3_NOTE).toMatch(/mentor stays with you from day one/);
    const about = readFileSync('components/spike-preview/AboutAiaCareer.tsx', 'utf8');
    expect(about).toContain('About the AIA advisor career');
    expect(about).toContain('Photo coming soon');
    expect(about).toContain('Video coming soon');
    expect(about).toContain('Based on AIA Philippines');
    expect(about).not.toMatch(/awaiting Nilo|Not downloaded|no embed|no hotlink|70 vs 80|year count/);
    expect(about).toContain('section.sourceLabel');
    expect(about).not.toMatch(/<a\b|sourceUrl/);
    expect(JSON.stringify(AIA_CAREER_SECTIONS)).not.toMatch(/70 vs 80|year count/);
  });
});

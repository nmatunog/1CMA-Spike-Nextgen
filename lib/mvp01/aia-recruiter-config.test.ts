import { afterEach, describe, expect, it } from 'vitest';
import {
  appendAiaFormScroll,
  candidateAiaHandoff,
  isAttributedAiaRegistrationUrl,
  isGenericAiaJoinUrl,
  readAiaRecruiterConfig,
  resolveAiaHandoffUrl,
} from './aia-recruiter-config';
import { AIA_LEADER_TASK } from './aia-model';

export function syntheticAiaRegistrationUrl(code = '000000000', name = 'TEST/RECRUITER') {
  const reference = Buffer.from(JSON.stringify({ code, name }), 'utf8').toString('base64');
  return `https://www.aia.com.ph/en/financialadvisor/join-us-now?reference=${reference}`;
}

const SYNTHETIC = syntheticAiaRegistrationUrl();

describe('AIA attributed registration URLs', () => {
  afterEach(() => {
    delete process.env.AIA_DEFAULT_RECRUITER_STAFF_ID;
    delete process.env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL;
    delete process.env.AIA_RECRUITER_REGISTRATION_URLS;
  });

  it('accepts https join-us-now with a non-empty reference and rejects everything else', () => {
    expect(isAttributedAiaRegistrationUrl(SYNTHETIC)).toBe(true);
    expect(isGenericAiaJoinUrl(SYNTHETIC)).toBe(false);
    expect(isAttributedAiaRegistrationUrl('https://www.aia.com.ph/en/financialadvisor/join-us-now')).toBe(false);
    expect(isGenericAiaJoinUrl('https://www.aia.com.ph/en/financialadvisor/join-us-now')).toBe(true);
    expect(isAttributedAiaRegistrationUrl('https://www.aia.com.ph/en/financialadvisor/join-us-now?reference=')).toBe(false);
    expect(isAttributedAiaRegistrationUrl('http://www.aia.com.ph/en/financialadvisor/join-us-now?reference=abc')).toBe(false);
    expect(isAttributedAiaRegistrationUrl('https://aia.com.ph/en/financialadvisor/join-us-now?reference=abc')).toBe(false);
    expect(isAttributedAiaRegistrationUrl('https://www.aia.com.ph/en/financialadvisor/partner-with-the-best?reference=abc')).toBe(false);
    expect(isAttributedAiaRegistrationUrl('https://example.test/join-us-now?reference=abc')).toBe(false);
  });

  it('reads per-recruiter URLs from env and ignores a generic default URL', () => {
    process.env.AIA_DEFAULT_RECRUITER_STAFF_ID = 'nilo-default@example.test';
    process.env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL = 'https://www.aia.com.ph/en/financialadvisor/join-us-now';
    process.env.AIA_RECRUITER_REGISTRATION_URLS = JSON.stringify({
      'leader@example.test': SYNTHETIC,
      'bad@example.test': 'https://www.aia.com.ph/en/financialadvisor/join-us-now',
    });
    const cfg = readAiaRecruiterConfig();
    expect(cfg.defaultStaffId).toBe('nilo-default@example.test');
    expect(cfg.defaultRegistrationUrl).toBeNull();
    expect(resolveAiaHandoffUrl('leader@example.test')).toBe(SYNTHETIC);
    expect(resolveAiaHandoffUrl('nilo-default@example.test')).toBeNull();
    expect(resolveAiaHandoffUrl('bad@example.test')).toBeNull();
  });

  it('never puts a generic join-us-now or a decoded agent code in candidate-facing output', () => {
    const generic = candidateAiaHandoff({
      attributed: true,
      registrationUrl: 'https://www.aia.com.ph/en/financialadvisor/join-us-now',
    });
    expect(generic).toEqual({ leaderTask: AIA_LEADER_TASK, registrationUrl: null });
    const none = candidateAiaHandoff({ attributed: false, registrationUrl: SYNTHETIC });
    expect(none.registrationUrl).toBeNull();
    const ok = candidateAiaHandoff({ attributed: true, registrationUrl: SYNTHETIC });
    expect(ok.registrationUrl).toBe(SYNTHETIC);
    expect(JSON.stringify(ok)).not.toMatch(/"code":/);
    expect(JSON.stringify(ok)).not.toMatch(/TEST\/RECRUITER/);
    expect(JSON.stringify(ok)).not.toMatch(/join-us-now(?!\?reference=)/);
  });

  it('optionally appends scroll=1 only when reference stays intact', () => {
    expect(isAttributedAiaRegistrationUrl(`${SYNTHETIC}&scroll=1`)).toBe(true);
    expect(appendAiaFormScroll(SYNTHETIC)).toBe(`${SYNTHETIC}&scroll=1`);
    expect(appendAiaFormScroll(`${SYNTHETIC}&scroll=1`)).toBe(`${SYNTHETIC}&scroll=1`);
    expect(appendAiaFormScroll('https://www.aia.com.ph/en/financialadvisor/join-us-now')).toBeNull();
    const scrolled = candidateAiaHandoff({ attributed: true, registrationUrl: SYNTHETIC, scrollToForm: true });
    expect(scrolled.registrationUrl).toBe(`${SYNTHETIC}&scroll=1`);
    expect(new URL(scrolled.registrationUrl || '').searchParams.get('reference')).toBe(new URL(SYNTHETIC).searchParams.get('reference'));
    expect(JSON.stringify(scrolled)).not.toMatch(/"code":/);
    expect(JSON.stringify(scrolled)).not.toMatch(/TEST\/RECRUITER/);
    expect(candidateAiaHandoff({
      attributed: true,
      registrationUrl: 'https://www.aia.com.ph/en/financialadvisor/join-us-now',
      scrollToForm: true,
    }).registrationUrl).toBeNull();
  });
});

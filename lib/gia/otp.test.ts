import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertOtpDevNotProduction, clearDevOtps, createMockOtpAdapter, generateOtpCode, hashOtp,
  otpMatches, peekDevOtp, planOtpVerify, OTP_MAX_ATTEMPTS,
} from './otp.mjs';

const secret = 's'.repeat(32);

describe('mock OTP adapter', () => {
  const prior = {
    GIA_OTP_DEV: process.env.GIA_OTP_DEV,
    GIA_SESSION_SECRET: process.env.GIA_SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    GIA_OTP_COOLDOWN_MS: process.env.GIA_OTP_COOLDOWN_MS,
  };
  beforeEach(() => {
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_SESSION_SECRET = secret;
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    clearDevOtps();
  });
  afterEach(() => {
    process.env.GIA_OTP_DEV = prior.GIA_OTP_DEV;
    process.env.GIA_SESSION_SECRET = prior.GIA_SESSION_SECRET;
    process.env.GIA_OTP_COOLDOWN_MS = prior.GIA_OTP_COOLDOWN_MS;
    vi.unstubAllEnvs();
    clearDevOtps();
  });

  it('issues a hashed challenge and verifies only the matching identity', async () => {
    const otp = createMockOtpAdapter();
    const issued = await otp.issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    expect(issued).not.toHaveProperty('devCode');
    const code = peekDevOtp('sess-a');
    expect(code).toMatch(/^\d{6}$/);
    expect((await otp.verify({ identity: 'sess-b', code })).ok).toBe(false);
    expect(await otp.isVerified('sess-a')).toBe(false);
    expect((await otp.verify({ identity: 'sess-a', code })).ok).toBe(true);
    expect(await otp.isVerified('sess-a')).toBe(true);
    expect(await otp.isVerified('sess-b')).toBe(false);
  });
  it('does not echo the code unless GIA_OTP_DEV is set', async () => {
    process.env.GIA_OTP_DEV = 'false';
    const issued = await createMockOtpAdapter().issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    expect(issued).not.toHaveProperty('devCode');
    expect(peekDevOtp('sess-a')).toBeUndefined();
  });
  it('refuses GIA_OTP_DEV in production', () => {
    process.env.GIA_OTP_DEV = 'true';
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertOtpDevNotProduction()).toThrow('otp_dev_forbidden');
  });
  it('compares OTP hashes in constant time and locks after leftover attempts', async () => {
    const code = generateOtpCode();
    const digest = hashOtp('sess-a', code, secret);
    expect(otpMatches('sess-a', code, digest, secret)).toBe(true);
    expect(otpMatches('sess-a', '000000', digest, secret)).toBe(false);
    const otp = createMockOtpAdapter();
    await otp.issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    const real = peekDevOtp('sess-a');
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      const result = await otp.verify({ identity: 'sess-a', code: '000000' });
      expect(result.ok).toBe(false);
    }
    const locked = await otp.verify({ identity: 'sess-a', code: real });
    expect(locked.ok).toBe(false);
    expect(locked.locked).toBe(true);
  });
  it('plans lockout so the real code fails after the max wrong attempts', () => {
    const digest = hashOtp('sess-a', '123456', secret);
    const fifthFail = planOtpVerify({ priorAttempts: 4, codeHash: digest, identity: 'sess-a', code: '000000' });
    expect(fifthFail).toMatchObject({ attempts: 5, ok: false, locked: true });
    const afterLock = planOtpVerify({ priorAttempts: 5, codeHash: digest, identity: 'sess-a', code: '123456' });
    expect(afterLock).toMatchObject({ attempts: 5, ok: false, locked: true, matched: false });
  });
  it('does not import a paid SMS or email provider', () => {
    const source = readFileSync(new URL('./otp.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(twilio|sendgrid|nexmo|vonage|mailgun|messagebird|postmark|mailchimp)\b/i);
  });
});

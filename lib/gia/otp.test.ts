import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMockOtpAdapter, hashOtp, otpMatches, generateOtpCode, OTP_MAX_ATTEMPTS } from './otp.mjs';

const secret = 's'.repeat(32);

describe('mock OTP adapter', () => {
  const prior = { GIA_OTP_DEV: process.env.GIA_OTP_DEV, GIA_SESSION_SECRET: process.env.GIA_SESSION_SECRET };
  beforeEach(() => { process.env.GIA_OTP_DEV = 'true'; process.env.GIA_SESSION_SECRET = secret; });
  afterEach(() => { process.env.GIA_OTP_DEV = prior.GIA_OTP_DEV; process.env.GIA_SESSION_SECRET = prior.GIA_SESSION_SECRET; });

  it('issues a hashed challenge and verifies only the matching identity', async () => {
    const otp = createMockOtpAdapter();
    const issued = await otp.issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    expect(issued.devCode).toMatch(/^\d{6}$/);
    expect(await otp.verify({ identity: 'sess-b', code: issued.devCode })).toBe(false);
    expect(await otp.isVerified('sess-a')).toBe(false);
    expect(await otp.verify({ identity: 'sess-a', code: issued.devCode })).toBe(true);
    expect(await otp.isVerified('sess-a')).toBe(true);
    expect(await otp.isVerified('sess-b')).toBe(false);
  });
  it('does not echo the code unless GIA_OTP_DEV is set', async () => {
    process.env.GIA_OTP_DEV = 'false';
    const issued = await createMockOtpAdapter().issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    expect(issued.devCode).toBeUndefined();
  });
  it('compares OTP hashes in constant time and rejects leftover attempts', async () => {
    const code = generateOtpCode();
    const digest = hashOtp('sess-a', code, secret);
    expect(otpMatches('sess-a', code, digest, secret)).toBe(true);
    expect(otpMatches('sess-a', '000000', digest, secret)).toBe(false);
    const otp = createMockOtpAdapter();
    await otp.issue({ identity: 'sess-a', channel: 'email', destination: 'visitor@example.test' });
    for (let i = 0; i < OTP_MAX_ATTEMPTS + 1; i += 1) await otp.verify({ identity: 'sess-a', code: '000000' });
    expect(await otp.verify({ identity: 'sess-a', code: '000000' })).toBe(false);
  });
  it('does not import a paid SMS or email provider', () => {
    const source = readFileSync(new URL('./otp.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(twilio|sendgrid|nexmo|vonage|mailgun|messagebird|postmark|mailchimp)\b/i);
  });
});

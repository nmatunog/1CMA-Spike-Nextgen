// OTP adapter interface + mock/dev implementation. No paid SMS/email provider.
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_VERIFIED_TTL_MS = 60 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_ISSUE_WINDOW_MS = 10 * 60 * 1000;
export const OTP_ISSUE_WINDOW_MAX = 5;
const devCodes = new Map();

export function otpIssueCooldownMs() {
  const raw = Number(process.env.GIA_OTP_COOLDOWN_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 30 * 1000;
}

export function otpSecret() {
  const s = process.env.GIA_OTP_SECRET || process.env.GIA_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('otp_not_configured');
  return s;
}

export function assertOtpDevNotProduction() {
  if (process.env.GIA_OTP_DEV === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error('otp_dev_forbidden');
  }
}

export function isOtpDev() {
  assertOtpDevNotProduction();
  return process.env.GIA_OTP_DEV === 'true';
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(identity, code, secret = otpSecret()) {
  return createHmac('sha256', secret).update(`gia-otp:${identity}:${code}`).digest('hex');
}

export function hashDestination(destination, secret = otpSecret()) {
  return createHmac('sha256', secret).update(`gia-otp-dest:${String(destination).trim().toLowerCase()}`).digest('hex');
}

export function hashClientKey(ipOrEmpty, secret) {
  const trimmed = String(ipOrEmpty || '').split(',')[0].trim().slice(0, 128);
  if (!trimmed) return null;
  try {
    return createHmac('sha256', secret || otpSecret()).update(`gia-otp-ip:${trimmed}`).digest('hex');
  } catch {
    return null;
  }
}

export function hashOtpThrottleKey(kind, value, secret = otpSecret()) {
  return createHmac('sha256', secret).update(`gia-otp-throttle:${kind}:${value}`).digest('hex');
}

export function otpMatches(identity, code, digest, secret = otpSecret()) {
  if (!/^[0-9]{6}$/.test(String(code)) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) return false;
  const actual = hashOtp(identity, String(code), secret);
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(digest, 'hex'));
  } catch {
    return false;
  }
}

export function verifiedStillValid(verifiedAt, now = Date.now()) {
  if (!verifiedAt) return false;
  return now - new Date(verifiedAt).getTime() < OTP_VERIFIED_TTL_MS;
}

/** Decision helper used by both the in-memory adapter and the SQL repository. */
export function planOtpVerify({ priorAttempts, codeHash, identity, code }) {
  const prior = Number(priorAttempts) || 0;
  if (prior >= OTP_MAX_ATTEMPTS) return { attempts: prior, ok: false, locked: true, matched: false };
  const attempts = prior + 1;
  const matched = otpMatches(identity, code, codeHash);
  if (!matched) return { attempts, ok: false, locked: attempts >= OTP_MAX_ATTEMPTS, matched: false };
  return { attempts, ok: true, locked: false, matched: true };
}

export function planOtpIssue({ lastIssuedAt, windowCount, windowStartedAt, now = Date.now() }) {
  const cooldown = otpIssueCooldownMs();
  if (lastIssuedAt && now - new Date(lastIssuedAt).getTime() < cooldown) return { allowed: false, reason: 'otp_throttled' };
  const windowMs = OTP_ISSUE_WINDOW_MS;
  const started = windowStartedAt ? new Date(windowStartedAt).getTime() : 0;
  const count = started && now - started < windowMs ? Number(windowCount) || 0 : 0;
  if (count >= OTP_ISSUE_WINDOW_MAX) return { allowed: false, reason: 'otp_throttled' };
  return { allowed: true, nextCount: count + 1, windowStartedAt: count === 0 ? new Date(now) : new Date(started || now) };
}

export function rememberDevOtp(identity, code) {
  if (!isOtpDev()) return;
  devCodes.set(identity, code);
  if (!process.env.VITEST) console.info('[gia-otp-dev] challenge issued; code is not in API responses');
}

export function peekDevOtp(identity) {
  if (!isOtpDev()) return undefined;
  return devCodes.get(identity);
}

export function clearDevOtps() {
  devCodes.clear();
}

/**
 * Adapter contract (mock/dev only):
 *   issue({ identity, channel, destination }) -> { challengeId, expiresAt }
 *   verify({ identity, code }) -> { ok, locked }
 *   isVerified(identity) -> boolean
 * Implementations must not call paid SMS, email, or model APIs.
 * Codes are never returned on the adapter result; tests use peekDevOtp().
 * @returns {{ issue: Function, verify: Function, isVerified: Function }}
 */
export function createMockOtpAdapter(store = new Map(), throttle = new Map()) {
  const open = (identity) => [...store.values()].filter(c => c.identity === identity).sort((a, b) => b.createdAt - a.createdAt);
  return {
    /** @returns {Promise<{ challengeId: string, expiresAt: Date }>} */
    async issue({ identity, channel, destination }) {
      if (!identity || !['email', 'mobile'].includes(channel) || !destination) throw new Error('invalid_otp_request');
      const existing = open(identity).find(c => !c.verifiedAt && c.expiresAt > new Date() && c.attempts < OTP_MAX_ATTEMPTS);
      if (existing) return { challengeId: existing.id, expiresAt: existing.expiresAt };
      const prior = throttle.get(identity) || {};
      const planned = planOtpIssue({ lastIssuedAt: prior.lastIssuedAt, windowCount: prior.windowCount, windowStartedAt: prior.windowStartedAt });
      if (!planned.allowed) throw new Error(planned.reason);
      const code = generateOtpCode();
      const challenge = {
        id: randomUUID(),
        identity,
        channel,
        destinationHash: hashDestination(destination),
        codeHash: hashOtp(identity, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        verifiedAt: null,
        attempts: 0,
        createdAt: Date.now(),
      };
      store.set(challenge.id, challenge);
      rememberDevOtp(identity, code);
      throttle.set(identity, { lastIssuedAt: Date.now(), windowCount: planned.nextCount, windowStartedAt: planned.windowStartedAt });
      return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
    },
    /** @returns {Promise<{ ok: boolean, locked: boolean }>} */
    async verify({ identity, code }) {
      const challenge = open(identity).find(c => !c.verifiedAt);
      if (!challenge) return { ok: false, locked: false };
      if (challenge.expiresAt <= new Date()) return { ok: false, locked: false };
      const planned = planOtpVerify({ priorAttempts: challenge.attempts, codeHash: challenge.codeHash, identity, code });
      challenge.attempts = planned.attempts;
      if (planned.ok) challenge.verifiedAt = new Date();
      return { ok: planned.ok, locked: planned.locked };
    },
    async isVerified(identity) {
      return open(identity).some(c => verifiedStillValid(c.verifiedAt));
    },
  };
}

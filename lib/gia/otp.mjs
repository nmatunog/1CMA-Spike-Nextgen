// OTP adapter interface + mock/dev implementation. No paid SMS/email provider.
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_VERIFIED_TTL_MS = 60 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function otpSecret() {
  const s = process.env.GIA_OTP_SECRET || process.env.GIA_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('otp_not_configured');
  return s;
}

export function isOtpDev() {
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

/**
 * Adapter contract (mock/dev only):
 *   issue({ identity, channel, destination }) -> { challengeId, expiresAt, devCode? }
 *   verify({ identity, code }) -> boolean
 *   isVerified(identity) -> boolean
 * Implementations must not call paid SMS, email, or model APIs. `devCode` is returned
 * only when GIA_OTP_DEV=true and must never be written to logs.
 */
export function createMockOtpAdapter(store = new Map()) {
  const open = (identity) => [...store.values()].filter(c => c.identity === identity).sort((a, b) => b.createdAt - a.createdAt);
  return {
    async issue({ identity, channel, destination }) {
      if (!identity || !['email', 'mobile'].includes(channel) || !destination) throw new Error('invalid_otp_request');
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
      const result = { challengeId: challenge.id, expiresAt: challenge.expiresAt };
      if (isOtpDev()) result.devCode = code;
      return result;
    },
    async verify({ identity, code }) {
      const challenge = open(identity).find(c => !c.verifiedAt && c.expiresAt > new Date());
      if (!challenge) return false;
      challenge.attempts += 1;
      if (challenge.attempts > OTP_MAX_ATTEMPTS) return false;
      if (!otpMatches(identity, code, challenge.codeHash)) return false;
      challenge.verifiedAt = new Date();
      return true;
    },
    async isVerified(identity) {
      return open(identity).some(c => verifiedStillValid(c.verifiedAt));
    },
  };
}

import { VERSA_HMAC_SECRET_ENV } from './constants.js';

const MIN_SECRET_LENGTH = 32;

/** @param {unknown} value */
export function normalizeSubmittedCode(value) {
  const raw = String(value ?? '').trim();
  if (/^(FREE|PRO)-/i.test(raw)) return raw.toUpperCase();
  return raw;
}

/** @param {unknown} value */
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {Record<string, string | undefined> | null | undefined} env
 * @returns {string}
 */
export function requireHmacSecret(env) {
  const secret = String(env?.[VERSA_HMAC_SECRET_ENV] ?? '').trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('Versa code gate is missing VERSA_CODE_HMAC_SECRET.');
  }
  return secret;
}

/**
 * HMAC-SHA-256 hex digest of a submitted code. Never store plaintext codes.
 * @param {string} secret
 * @param {string} code
 */
export async function digestCode(secret, code) {
  const normalized = normalizeSubmittedCode(code);
  if (!normalized) {
    throw new Error('Code is required.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

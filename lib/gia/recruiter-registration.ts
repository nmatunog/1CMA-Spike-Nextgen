/**
 * Attributed AIA recruiter registration URLs (Nilo, 14 Nov 2026 PHT).
 * Keep in lockstep with C1 `isAttributedAiaRegistrationUrl` on #20:
 * https, www.aia.com.ph, /en/financialadvisor/join-us-now, non-empty `reference`.
 * Bare join-us-now (no reference) is a generic signup and must never be a CTA.
 */

export const AIA_JOIN_PATH = '/en/financialadvisor/join-us-now';
export const AIA_JOIN_HOST = 'www.aia.com.ph';
export const RECRUITER_CTA_LABEL = 'Register with your recruiter';
export const RECRUITER_WAITING_LABEL = 'Your recruiter will contact you';

/** Tests and screenshots only. Never a live recruiter. base64 of {"code":"000000000","name":"TEST/RECRUITER"}. */
export const SYNTHETIC_RECRUITER_REFERENCE = 'eyJjb2RlIjoiMDAwMDAwMDAwIiwibmFtZSI6IlRFU1QvUkVDUlVJVEVSIn0=';
export const SYNTHETIC_RECRUITER_REGISTRATION_URL =
  `https://${AIA_JOIN_HOST}${AIA_JOIN_PATH}?reference=${SYNTHETIC_RECRUITER_REFERENCE}`;
export const SYNTHETIC_RECRUITER_DISPLAY_NAME = 'TEST/RECRUITER';

export type RecruiterRegistration = {
  url: string;
  name: string | null;
};

export type RecruiterCta =
  | { kind: 'hidden' }
  | { kind: 'waiting'; label: string }
  | { kind: 'cta'; label: string; url: string; name: string | null };

function decodeBase64(value: string) {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf8');
  return atob(value);
}

export function isAttributedRecruiterUrl(raw: string | null | undefined): boolean {
  return sanitizeAttributedRecruiterUrl(raw) != null;
}

function normalizeJoinPath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function sanitizeAttributedRecruiterUrl(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== AIA_JOIN_HOST) return null;
  if (normalizeJoinPath(parsed.pathname) !== AIA_JOIN_PATH) return null;
  const reference = parsed.searchParams.get('reference');
  if (typeof reference !== 'string' || !reference.trim()) return null;
  return value;
}

/** Display name only — never the decoded agent code. */
export function recruiterDisplayName(url: string | null, configuredName?: string | null): string | null {
  const fromEnv = String(configuredName || '').trim();
  if (fromEnv) return fromEnv;
  const clean = sanitizeAttributedRecruiterUrl(url);
  if (!clean) return null;
  const reference = new URL(clean).searchParams.get('reference') || '';
  try {
    const json = decodeBase64(reference);
    const parsed = JSON.parse(json) as { name?: unknown; code?: unknown };
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}

export function readDefaultRecruiterRegistration(
  env: Record<string, string | undefined> = process.env,
): RecruiterRegistration | null {
  const url = sanitizeAttributedRecruiterUrl(env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL);
  if (!url) return null;
  return { url, name: recruiterDisplayName(url, env.AIA_DEFAULT_RECRUITER_DISPLAY_NAME) };
}

export function resolveRecruiterCta(input: {
  consented: boolean;
  stopped?: boolean;
  program?: string;
  assignedUrl?: string | null;
  assignedName?: string | null;
  defaultUrl?: string | null;
  defaultName?: string | null;
}): RecruiterCta {
  if (!input.consented || input.stopped || (input.program && input.program !== 'recruit')) {
    return { kind: 'hidden' };
  }
  const assigned = sanitizeAttributedRecruiterUrl(input.assignedUrl);
  const fallback = sanitizeAttributedRecruiterUrl(input.defaultUrl);
  const url = assigned || fallback;
  if (!url) return { kind: 'waiting', label: RECRUITER_WAITING_LABEL };
  const name = assigned
    ? recruiterDisplayName(assigned, input.assignedName)
    : recruiterDisplayName(fallback, input.defaultName);
  return { kind: 'cta', label: RECRUITER_CTA_LABEL, url, name };
}

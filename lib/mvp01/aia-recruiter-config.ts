import { AIA_LEADER_TASK } from './aia-model';

const AIA_HOST = 'www.aia.com.ph';
const AIA_JOIN_PATH = '/en/financialadvisor/join-us-now';

export type AiaCandidateHandoff = {
  leaderTask: string;
  registrationUrl: string | null;
};

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

function parseUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** True only for https://www.aia.com.ph/en/financialadvisor/join-us-now?reference=<non-empty>. */
export function isAttributedAiaRegistrationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol !== 'https:') return false;
  if (url.hostname !== AIA_HOST) return false;
  if (normalizePath(url.pathname) !== AIA_JOIN_PATH) return false;
  const reference = url.searchParams.get('reference');
  return typeof reference === 'string' && reference.trim().length > 0;
}

/** Bare join-us-now (no recruiter reference) must never be used as a destination. */
export function isGenericAiaJoinUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const url = parseUrl(value);
  if (url) {
    if (url.hostname !== AIA_HOST) return false;
    if (normalizePath(url.pathname) !== AIA_JOIN_PATH) return false;
    const reference = url.searchParams.get('reference');
    return !(typeof reference === 'string' && reference.trim().length > 0);
  }
  return /join-us-now/i.test(value) && !/[?&]reference=/i.test(value);
}

function sanitizedRegistrationUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!isAttributedAiaRegistrationUrl(trimmed)) return null;
  return trimmed;
}

function parseUrlMap(raw: string | undefined) {
  const out: Record<string, string> = {};
  if (!raw || !raw.trim()) return out;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    for (const [staffId, url] of Object.entries(parsed as Record<string, unknown>)) {
      const id = staffId.trim();
      const sanitized = sanitizedRegistrationUrl(url);
      if (id && sanitized) out[id] = sanitized;
    }
  } catch {
    return out;
  }
  return out;
}

export function readAiaRecruiterConfig() {
  const defaultStaffId = (process.env.AIA_DEFAULT_RECRUITER_STAFF_ID || '').trim() || null;
  const defaultRegistrationUrl = sanitizedRegistrationUrl(process.env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL);
  const urlsByStaffId = parseUrlMap(process.env.AIA_RECRUITER_REGISTRATION_URLS);
  if (defaultStaffId && defaultRegistrationUrl && !urlsByStaffId[defaultStaffId]) {
    urlsByStaffId[defaultStaffId] = defaultRegistrationUrl;
  }
  return { defaultStaffId, defaultRegistrationUrl, urlsByStaffId };
}

export function resolveAiaHandoffUrl(staffId: string | null | undefined) {
  const id = (staffId || '').trim() || null;
  if (!id) return null;
  const { urlsByStaffId } = readAiaRecruiterConfig();
  return urlsByStaffId[id] || null;
}

export function resolveDefaultAiaRecruiter() {
  const { defaultStaffId, defaultRegistrationUrl } = readAiaRecruiterConfig();
  if (!defaultStaffId) return null;
  return { staffId: defaultStaffId, registrationUrl: defaultRegistrationUrl };
}

/**
 * Optional `scroll=1` so AIA jumps to the form. Appends only when the URL already
 * validates and `reference` is unchanged. Never used on a generic join-us-now.
 */
export function appendAiaFormScroll(value: unknown): string | null {
  if (!isAttributedAiaRegistrationUrl(value)) return null;
  const original = String(value).trim();
  const parsed = parseUrl(original);
  if (!parsed) return null;
  const reference = parsed.searchParams.get('reference');
  if (!reference) return null;
  if (parsed.searchParams.get('scroll') === '1') return original;
  const next = original.includes('?') ? `${original}&scroll=1` : `${original}?scroll=1`;
  if (!isAttributedAiaRegistrationUrl(next)) return null;
  const nextParsed = parseUrl(next);
  if (!nextParsed || nextParsed.searchParams.get('reference') !== reference) return null;
  return next;
}

/** Candidate-facing handoff: attributed URL or leader task only. Never a generic join-us-now. */
export function candidateAiaHandoff(input: {
  attributed?: boolean;
  registrationUrl?: string | null;
  scrollToForm?: boolean;
} = {}): AiaCandidateHandoff {
  if (!input.attributed) return { leaderTask: AIA_LEADER_TASK, registrationUrl: null };
  const url = sanitizedRegistrationUrl(input.registrationUrl || '');
  if (!url) return { leaderTask: AIA_LEADER_TASK, registrationUrl: null };
  if (!input.scrollToForm) return { leaderTask: AIA_LEADER_TASK, registrationUrl: url };
  return { leaderTask: AIA_LEADER_TASK, registrationUrl: appendAiaFormScroll(url) || url };
}

import { isAiaCredentialDump } from '@/lib/gia/credential-safety.mjs';
import { EVENT_KINDS } from '@/lib/recruitment/stages';
import { isStopped } from '@/lib/recruitment/suppression';
import { isUuid, type Sql } from '@/lib/recruitment/store';
import { isValidEmail, isValidPhone, normalizePhone } from '@/lib/recruitment/contacts';
import type { StaffActor } from '@/lib/recruitment/types';
import {
  COMM_CHANNELS,
  GIA_ENGAGEMENT_KINDS,
  type CommChannel,
  type ConsentState,
  type GiaEngagementEventInput,
  type GiaEngagementKind,
} from './interfaces';

const KIND_TO_EVENT: Record<GiaEngagementKind, string> = {
  'gia.conversation': EVENT_KINDS.giaConversation,
  'gia.handoff': EVENT_KINDS.giaHandoff,
  'literacy.interest': EVENT_KINDS.literacyInterest,
  'fep.booked': EVENT_KINDS.fepBooked,
  'fep.attended': EVENT_KINDS.fepAttended,
};

/** Staff HTTP and G1 visitor paths only accept these metadata keys. */
export const ENGAGEMENT_METADATA_KEYS = ['intent', 'citation'] as const;

export function isGiaEngagementKind(value: unknown): value is GiaEngagementKind {
  return typeof value === 'string' && (GIA_ENGAGEMENT_KINDS as readonly string[]).includes(value);
}

export function canMessage(
  state: { stopped: boolean; consent: ConsentState; prefs: Partial<Record<CommChannel, boolean>> },
  channel: CommChannel,
) {
  if (state.stopped) return false;
  if (state.consent !== 'granted') return false;
  return state.prefs[channel] === true;
}

const ZERO_WIDTH = /[\u00AD\u034F\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/** NFKC + strip zero-width so fullwidth and hidden OTPs still match. */
export function normalizeForSecretCheck(value: string) {
  return value.normalize('NFKC').replace(ZERO_WIDTH, '');
}

export function looksLikeContact(value: string) {
  const normalized = normalizeForSecretCheck(value);
  if (normalized.includes('@') || isValidEmail(normalized)) return true;
  if (/\b[a-z0-9._%+-]+\s+(?:at|\[at\]|\(at\))\s+[a-z0-9.-]+\.[a-z]{2,}\b/i.test(normalized)) return true;
  if (/\b[a-z0-9._%+-]+\s*(?:\[at\]|\(at\))\s*[a-z0-9.-]+\.[a-z]{2,}\b/i.test(normalized)) return true;
  if (/\b[a-z0-9._%+-]+\s+at\s+[a-z0-9.-]+\s+dot\s+[a-z]{2,}\b/i.test(normalized)) return true;
  const phone = normalizePhone(normalized);
  return !!(phone && isValidPhone(phone));
}

function codeTokens(normalized: string) {
  return normalized.match(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g) || [];
}

function isKnowledgeCitation(token: string) {
  return /^KP-[A-Z]{2,5}-\d{1,3}$/i.test(token);
}

function compactAlnum(token: string) {
  return token.replace(/[-_]/g, '');
}

function looksLikeCodePayload(compact: string) {
  if (compact.length < 6) return false;
  if (/[A-Za-z]/.test(compact) && /\d/.test(compact)) return true;
  if (/[A-Z]/.test(compact) && compact === compact.toUpperCase()) return true;
  if (/^[0-9a-f]+$/i.test(compact)) return true;
  if (!/[aeiou]/i.test(compact)) return true;
  return false;
}

function joinSeparatedGroups(value: string) {
  const groups = value.match(/[A-Za-z0-9]+/g) || [];
  return groups.join('');
}

/** Mixed letter+digit token of 6+ chars (dashes/underscores allowed). Citations like KP-LIT-01 stay allowed. */
function hasMixedCodeToken(normalized: string) {
  if (codeTokens(normalized).some(token => {
    if (isKnowledgeCitation(token)) return false;
    const compact = compactAlnum(token);
    return compact.length >= 6 && /[A-Za-z]/.test(compact) && /\d/.test(compact);
  })) return true;
  const split = normalized.match(/[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*(?:[\s\-_][A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*)+/);
  if (!split) return false;
  const compact = joinSeparatedGroups(split[0]);
  return compact.length >= 6 && !isKnowledgeCitation(split[0].replace(/\s+/g, ''));
}

function joinedGroupsAfterCue(rest: string) {
  let s = rest.replace(/^[\s:_-]+/, '').replace(/^(?:is|kay)\s+/i, '');
  const groups: string[] = [];
  while (s.length) {
    const group = s.match(/^[A-Za-z0-9]+/);
    if (!group) break;
    groups.push(group[0]);
    s = s.slice(group[0].length);
    const sep = s.match(/^[\s\-_]+/);
    if (sep) s = s.slice(sep[0].length);
    else break;
  }
  return groups.join('');
}

/** "code" / "kodigo" / "kode": join the alphanumeric groups that follow (spaces, dashes, underscores). */
function codeWordNearToken(normalized: string) {
  const word = /\b(?:code|codes|kodigo|kode)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = word.exec(normalized))) {
    const compact = joinedGroupsAfterCue(normalized.slice(match.index + match[0].length));
    if (looksLikeCodePayload(compact)) return true;
    const window = normalized.slice(Math.max(0, match.index - 32), Math.min(normalized.length, match.index + match[0].length + 40));
    for (const token of codeTokens(window)) {
      if (token.toLowerCase() === match[0].toLowerCase() || isKnowledgeCitation(token)) continue;
      const tokenCompact = compactAlnum(token);
      if (looksLikeCodePayload(tokenCompact)) return true;
    }
  }
  return false;
}

/** OTP (4+ digit runs) and access-code shaped tokens. Citations like KP-LIT-01 stay allowed. */
export function looksLikeSecretToken(value: string) {
  const normalized = normalizeForSecretCheck(value);
  const withoutYears = normalized.replace(/\b(?:19|20)\d{2}\b/g, ' ');
  if (/\d{4,}/.test(withoutYears)) return true;
  if (/\b(otp|passcode|one[ -]?time|access[_\s-]?code|activation[_\s-]?code)\b/i.test(normalized)) return true;
  if (/\b(?:FREE|PRO)[-_][A-Z0-9]{4,}\b/i.test(normalized)) return true;
  if (/\b[A-Z]{1,3}[-_][A-Z0-9]*\d{4,}[A-Z0-9]*\b/i.test(withoutYears)) return true;
  // Spaced/dashed 6-digit OTPs: "12 34 56", "123 456", "1 2 3 4 5 6". Dates like "12 2026" stay allowed.
  if (/\b(?:\d{2}[\s.-]){2}\d{2}\b/.test(withoutYears) || /\b\d{3}[\s.-]\d{3}\b/.test(withoutYears) || /\b(?:\d[\s.-]){5}\d\b/.test(withoutYears)) return true;
  if (hasMixedCodeToken(normalized) || codeWordNearToken(normalized)) return true;
  return false;
}

/** Refused credentials must never be retained, even when the password is an ordinary word. */
export function storeableMessageText(text: unknown, intent: string | null = null, reason: string | null = null) {
  if (typeof text !== 'string' || !text) return null;
  if (reason === 'documents' || reason === 'aia_credentials' || intent === 'get_my_status') return null;
  if (isAiaCredentialDump(text) || looksLikeSecretToken(text) || looksLikeContact(text)) return null;
  return text;
}

export function sanitizeEngagementMetadata(raw: unknown): Record<string, string> {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid');
  const src = raw as Record<string, unknown>;
  const allowed = ENGAGEMENT_METADATA_KEYS as readonly string[];
  for (const key of Object.keys(src)) {
    if (!allowed.includes(key)) throw new Error('invalid');
  }
  const out: Record<string, string> = {};
  for (const key of ENGAGEMENT_METADATA_KEYS) {
    if (!(key in src) || src[key] == null || src[key] === '') continue;
    const value = src[key];
    if (typeof value !== 'string') throw new Error('invalid');
    if (value.length > 80) throw new Error('invalid');
    if (looksLikeContact(value) || looksLikeSecretToken(value)) throw new Error('invalid');
    out[key] = value;
  }
  return out;
}

async function writeEngagementOn(t: Sql, input: GiaEngagementEventInput, staff: StaffActor | null) {
  if (!isGiaEngagementKind(input.kind)) throw new Error('invalid');
  if (!isUuid(input.candidateId)) throw new Error('invalid');
  const metadata = sanitizeEngagementMetadata(input.metadata);
  const actor = (input.actor || '').trim().slice(0, 120) || 'gia';
  const [c] = staff
    ? await t`SELECT id, stage FROM candidates WHERE id=${input.candidateId} AND (${staff.role}='admin' OR assigned_leader=${staff.email}) AND merged_into IS NULL FOR UPDATE`
    : await t`SELECT id, stage FROM candidates WHERE id=${input.candidateId} AND merged_into IS NULL FOR UPDATE`;
  if (!c) throw new Error(staff ? 'forbidden' : 'not_found');
  const stopped = isStopped(c);
  if (stopped && (input.kind === 'fep.booked' || input.kind === 'literacy.interest')) {
    throw new Error('suppressed');
  }
  const kind = KIND_TO_EVENT[input.kind];
  const payload = { ...metadata, officialDecision: false };
  await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
    VALUES(${input.candidateId},${kind},${actor},${t.json ? t.json(payload) : JSON.stringify(payload)})`;
  if (!stopped && (input.kind === 'fep.booked' || input.kind === 'fep.attended' || input.kind === 'literacy.interest' || input.kind === 'gia.handoff')) {
    await t`UPDATE candidates SET last_engaged_at=now() WHERE id=${input.candidateId}`;
  }
  return { ok: true as const, kind: input.kind };
}

async function writeEngagement(sql: Sql, input: GiaEngagementEventInput, staff: StaffActor | null) {
  return sql.begin(async (t: Sql) => writeEngagementOn(t, input, staff));
}

/** Staff Command Center path. Same admin-or-assigned-leader scope as evaluate / follow-up. */
export async function ingestGiaEngagementEvent(sql: Sql, staff: StaffActor, input: GiaEngagementEventInput) {
  return writeEngagement(sql, input, staff);
}

/**
 * G1 server-side only. Records visitor events (including unassigned).
 * Do not call from any staff HTTP route.
 */
export async function recordGiaVisitorEngagement(sql: Sql, input: GiaEngagementEventInput) {
  return writeEngagement(sql, input, null);
}

/** Same writer for a GIA repository transaction that already holds the row lock. */
export async function recordGiaVisitorEngagementOn(sql: Sql, input: GiaEngagementEventInput) {
  return writeEngagementOn(sql, input, null);
}

export { COMM_CHANNELS };

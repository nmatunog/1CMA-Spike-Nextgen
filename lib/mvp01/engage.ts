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

function looksLikeContact(value: string) {
  if (value.includes('@') || isValidEmail(value)) return true;
  const phone = normalizePhone(value);
  return !!(phone && isValidPhone(phone));
}

/** OTP (4+ digit runs) and access-code shaped tokens. Citations like KP-LIT-01 stay allowed. */
export function looksLikeSecretToken(value: string) {
  if (/\d{4,}/.test(value)) return true;
  if (/\b(otp|passcode|one[ -]?time|access[_\s-]?code|activation[_\s-]?code)\b/i.test(value)) return true;
  if (/\b[A-Z]{1,3}[-_][A-Z0-9]*\d{4,}[A-Z0-9]*\b/i.test(value)) return true;
  return false;
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

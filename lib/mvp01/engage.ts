import { EVENT_KINDS } from '@/lib/recruitment/stages';
import { isStopped } from '@/lib/recruitment/suppression';
import type { Sql } from '@/lib/recruitment/store';
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

export async function ingestGiaEngagementEvent(sql: Sql, input: GiaEngagementEventInput) {
  if (!isGiaEngagementKind(input.kind)) throw new Error('invalid');
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const blob = JSON.stringify(metadata);
  if (/access_code|otp|password|secret/i.test(blob) && /\d{4,}/.test(blob)) throw new Error('invalid');
  return sql.begin(async (t: Sql) => {
    const [c] = await t`SELECT id, stage FROM candidates WHERE id=${input.candidateId} AND merged_into IS NULL FOR UPDATE`;
    if (!c) throw new Error('not_found');
    const stopped = isStopped(c);
    if (stopped && (input.kind === 'fep.booked' || input.kind === 'literacy.interest')) {
      throw new Error('suppressed');
    }
    const kind = KIND_TO_EVENT[input.kind];
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
      VALUES(${input.candidateId},${kind},${input.actor},${t.json ? t.json({ ...metadata, officialDecision: false }) : JSON.stringify({ ...metadata, officialDecision: false })})`;
    if (!stopped && (input.kind === 'fep.booked' || input.kind === 'fep.attended' || input.kind === 'literacy.interest' || input.kind === 'gia.handoff')) {
      await t`UPDATE candidates SET last_engaged_at=now() WHERE id=${input.candidateId}`;
    }
    return { ok: true as const, kind: input.kind };
  });
}

export { COMM_CHANNELS };

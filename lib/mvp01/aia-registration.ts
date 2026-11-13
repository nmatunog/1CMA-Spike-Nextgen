import { EVENT_KINDS } from '@/lib/recruitment/stages';
import { assertWritable, identityIsSuppressed } from '@/lib/recruitment/suppression';
import { assignedLeaderAllowed, isUuid, type Sql } from '@/lib/recruitment/store';
import type { StaffActor } from '@/lib/recruitment/types';
import { looksLikeContact, looksLikeSecretToken } from './engage';
import {
  AIA_EVENT_KINDS,
  AIA_LEADER_TASK,
  aiaStatusRank,
  deriveAiaRegistration,
  isAiaAdvisorPathway,
  kindToAiaStatus,
  stageImpliesFepAttendance,
  type AiaRegistrationAction,
  type AiaRegistrationSource,
  type AiaRegistrationStatus,
  type AiaTimelineEvent,
} from './aia-model';

export {
  AIA_ADVISOR_PROGRAM_INTEREST,
  AIA_EVENT_KINDS,
  AIA_LEADER_TASK,
  AIA_PUBLIC_LINKS,
  AIA_REGISTRATION_STATES,
  deriveAiaRegistration,
  isAiaAdvisorPathway,
} from './aia-model';
export type {
  AiaAttribution,
  AiaRegistrationAction,
  AiaRegistrationSource,
  AiaRegistrationStatus,
} from './aia-model';

export type AiaRegistrationInput = {
  candidateId: string;
  action: AiaRegistrationAction;
  referralSource?: string;
  source?: AiaRegistrationSource;
};

const REFERRAL_MAX = 120;
const BLOCKED_HANDOFF = /https?:\/\/|aia\.com\.ph|irecruit/i;

function jsonParam(t: Sql, value: unknown) {
  return t.json ? t.json(value) : JSON.stringify(value);
}

function asEvents(rows: Record<string, unknown>[]): AiaTimelineEvent[] {
  return rows.map((row) => ({
    kind: String(row.kind),
    actor: String(row.actor),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) as Record<string, unknown> : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
  }));
}

export function sanitizeReferralSource(value: unknown) {
  if (typeof value !== 'string') throw new Error('invalid');
  const referralSource = value.trim();
  if (!referralSource || referralSource.length > REFERRAL_MAX) throw new Error('invalid');
  if (looksLikeContact(referralSource) || looksLikeSecretToken(referralSource)) throw new Error('invalid');
  if (BLOCKED_HANDOFF.test(referralSource)) throw new Error('invalid');
  return referralSource;
}

function parseAction(value: unknown): AiaRegistrationAction {
  if (value === 'confirm_attribution' || value === 'pending' || value === 'submitted' || value === 'verified') return value;
  throw new Error('invalid');
}

export function parseAiaRegistrationBody(body: Record<string, unknown>): AiaRegistrationInput {
  const source = body.source;
  if (source != null && source !== 'self_report' && source !== 'staff') throw new Error('invalid');
  return {
    candidateId: String(body.id || body.candidateId || ''),
    action: parseAction(body.action),
    referralSource: typeof body.referralSource === 'string' ? body.referralSource : undefined,
    source: source || undefined,
  };
}

async function loadTimeline(t: Sql, candidateId: string) {
    const rows = await t`
    SELECT kind, actor, metadata, created_at
    FROM candidate_events
    WHERE candidate_id = ${candidateId}
      AND (
        kind = ${AIA_EVENT_KINDS.attributionConfirmed}
        OR kind = ${AIA_EVENT_KINDS.pending}
        OR kind = ${AIA_EVENT_KINDS.submitted}
        OR kind = ${AIA_EVENT_KINDS.verified}
        OR kind = ${EVENT_KINDS.fepAttended}
      )
    ORDER BY created_at ASC`;
  return asEvents(rows as Record<string, unknown>[]);
}

function hasFepAttendance(stage: string, events: AiaTimelineEvent[]) {
  if (stageImpliesFepAttendance(stage)) return true;
  return events.some((event) => event.kind === EVENT_KINDS.fepAttended);
}

export async function applyAiaRegistration(sql: Sql, actor: StaffActor, input: AiaRegistrationInput) {
  if (!isUuid(input.candidateId)) throw new Error('invalid');
  const action = parseAction(input.action);
  const requestedSource: AiaRegistrationSource = input.source || (action === 'pending' ? 'self_report' : 'staff');
  if (action !== 'pending' && requestedSource === 'self_report') throw new Error('invalid');
  if (action === 'submitted' || action === 'verified') {
    if (requestedSource !== 'staff') throw new Error('invalid');
  }

  return sql.begin(async (t: Sql) => {
    const [c] = await t`SELECT * FROM candidates WHERE id=${input.candidateId} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) AND merged_into IS NULL FOR UPDATE`;
    if (!c) throw new Error('forbidden');
    assertWritable(c as { stage: string });
    if (await identityIsSuppressed(t, `candidate:${input.candidateId}`)) throw new Error('suppressed');

    const programInterest = (c.program_interest as string | null) || null;
    if (!isAiaAdvisorPathway(programInterest)) throw new Error('not_aia_pathway');

    const assignedLeader = (c.assigned_leader as string | null) || null;
    if (!assignedLeader) throw new Error('attribution_missing');
    if (!assignedLeaderAllowed(assignedLeader)) throw new Error('attribution_missing');

    const events = await loadTimeline(t, input.candidateId);
    if (!hasFepAttendance(String(c.stage), events)) throw new Error('fep_attendance_required');

    const current = deriveAiaRegistration(events);
    const spikePaid = c.spike_paid === true || c.spike_paid === 't' || c.spike_paid === 'true';
    const literacyStatus = String(c.literacy_status || 'not_started');
    const stage = String(c.stage);

    if (action === 'confirm_attribution') {
      const referralSource = sanitizeReferralSource(input.referralSource);
      const confirmedAt = new Date().toISOString();
      const due = c.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const metadata = {
        recruiterEmail: assignedLeader,
        referralSource,
        confirmedBy: actor.email,
        confirmedAt,
        pathway: 'aia_advisor',
        programInterest,
        officialDecision: false,
        entitlementsUnchanged: true,
        stageUnchanged: stage,
        spikePaidUnchanged: true,
      };
      await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
        VALUES(${input.candidateId},${AIA_EVENT_KINDS.attributionConfirmed},${actor.email},${jsonParam(t, metadata)})`;
      await t`UPDATE candidates SET next_action=${AIA_LEADER_TASK}, due_at=${due} WHERE id=${input.candidateId}`;
      await t`INSERT INTO command_audit_events(kind,actor,metadata)
        VALUES(${AIA_EVENT_KINDS.attributionConfirmed},${actor.email},${jsonParam(t, { candidateId: input.candidateId, recruiterEmail: assignedLeader, role: actor.role })})`;
      return {
        ok: true as const,
        action,
        status: current.status,
        recruiterEmail: assignedLeader,
        referralSource,
        leaderTask: AIA_LEADER_TASK,
        stage,
        spikePaid,
        literacyStatus,
      };
    }

    if (!current.attribution) throw new Error('attribution_missing');
    if (current.attribution.recruiterEmail !== assignedLeader) throw new Error('attribution_stale');

    const nextStatus: AiaRegistrationStatus = action === 'pending'
      ? 'aia_registration_pending'
      : action === 'submitted'
        ? 'aia_registration_submitted'
        : 'aia_registration_verified';
    if (action === 'verified' && current.status !== 'aia_registration_submitted' && current.status !== 'aia_registration_verified') {
      throw new Error('invalid');
    }
    if (aiaStatusRank(nextStatus) < aiaStatusRank(current.status)) throw new Error('invalid');

    const kind = action === 'pending'
      ? AIA_EVENT_KINDS.pending
      : action === 'submitted'
        ? AIA_EVENT_KINDS.submitted
        : AIA_EVENT_KINDS.verified;
    const at = new Date().toISOString();
    const metadata: Record<string, unknown> = {
      status: nextStatus,
      source: requestedSource,
      recruiterEmail: assignedLeader,
      referralSource: current.attribution.referralSource,
      confirmedBy: current.attribution.confirmedBy,
      pathway: 'aia_advisor',
      programInterest,
      officialDecision: action === 'verified',
      entitlementsUnchanged: true,
      stageUnchanged: stage,
      spikePaidUnchanged: true,
      literacyUnchanged: true,
    };
    if (action === 'submitted') {
      metadata.submittedBy = actor.email;
      metadata.submittedAt = at;
    }
    if (action === 'verified') {
      metadata.verifiedBy = actor.email;
      metadata.verifiedAt = at;
    }
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
      VALUES(${input.candidateId},${kind},${actor.email},${jsonParam(t, metadata)})`;
    await t`INSERT INTO command_audit_events(kind,actor,metadata)
      VALUES(${kind},${actor.email},${jsonParam(t, { candidateId: input.candidateId, status: nextStatus, role: actor.role, source: requestedSource })})`;
    return {
      ok: true as const,
      action,
      status: nextStatus,
      recruiterEmail: assignedLeader,
      referralSource: current.attribution.referralSource,
      leaderTask: AIA_LEADER_TASK,
      stage,
      spikePaid,
      literacyStatus,
    };
  });
}

export function isAiaEventKind(kind: string) {
  return Boolean(kindToAiaStatus(kind) || kind === AIA_EVENT_KINDS.attributionConfirmed);
}

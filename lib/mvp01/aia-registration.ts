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
  type AiaAttributionSource,
  type AiaRegistrationAction,
  type AiaRegistrationSource,
  type AiaRegistrationStatus,
  type AiaTimelineEvent,
} from './aia-model';
import {
  candidateAiaHandoff,
  resolveAiaHandoffUrl,
  resolveDefaultAiaRecruiter,
} from './aia-recruiter-config';
import { isAiaAssistedFieldId, mapAssistedRegistrationFields } from './aia-assisted-fields';

export {
  AIA_ADVISOR_PROGRAM_INTEREST,
  AIA_EVENT_KINDS,
  AIA_LEADER_TASK,
  AIA_PUBLIC_LINKS,
  AIA_STAFF_REFERENCE_PAGES,
  deriveAiaRegistration,
  isAiaAdvisorPathway,
} from './aia-model';
export {
  AIA_ASK_ON_FORM,
  AIA_ASSISTED_CANDIDATE_ON_FORM,
  AIA_ASSISTED_REGISTRATION_FIELDS,
  AIA_MOBILE_FORMAT_HINT,
  mapAssistedRegistrationFields,
} from './aia-assisted-fields';
export {
  appendAiaFormScroll,
  candidateAiaHandoff,
  isAttributedAiaRegistrationUrl,
  isGenericAiaJoinUrl,
  readAiaRecruiterConfig,
  resolveAiaHandoffUrl,
} from './aia-recruiter-config';
export type {
  AiaAttribution,
  AiaAttributionSource,
  AiaRegistrationAction,
  AiaRegistrationSource,
  AiaRegistrationStatus,
} from './aia-model';

export type AiaRegistrationInput = {
  candidateId: string;
  action: AiaRegistrationAction;
  referralSource?: string;
  source?: AiaRegistrationSource;
  fieldId?: string;
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
  if (
    value === 'confirm_attribution'
    || value === 'pending'
    || value === 'submitted'
    || value === 'verified'
    || value === 'open_assisted'
    || value === 'copy_field'
  ) return value;
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
    fieldId: typeof body.fieldId === 'string' ? body.fieldId : undefined,
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

function handoffFor(staffId: string, attributed: boolean) {
  return candidateAiaHandoff({
    attributed,
    registrationUrl: resolveAiaHandoffUrl(staffId),
    scrollToForm: true,
  });
}

async function confirmAttributionOn(
  t: Sql,
  input: {
    candidateId: string;
    actor: StaffActor;
    recruiterEmail: string;
    attributionSource: AiaAttributionSource;
    referralSource: string;
    programInterest: string | null;
    stage: string;
    previousAssigned: string | null;
  },
) {
  const confirmedAt = new Date().toISOString();
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const metadata = {
    recruiterEmail: input.recruiterEmail,
    referralSource: input.referralSource,
    confirmedBy: input.actor.email,
    confirmedAt,
    attributionSource: input.attributionSource,
    pathway: 'aia_advisor',
    programInterest: input.programInterest,
    officialDecision: false,
    entitlementsUnchanged: true,
    stageUnchanged: input.stage,
    spikePaidUnchanged: true,
    hasRegistrationUrl: Boolean(resolveAiaHandoffUrl(input.recruiterEmail)),
  };
  if ((input.previousAssigned || null) !== input.recruiterEmail) {
    await t`UPDATE candidates SET assigned_leader=${input.recruiterEmail} WHERE id=${input.candidateId}`;
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
      VALUES(${input.candidateId},${EVENT_KINDS.assignmentChanged},${input.actor.email},${jsonParam(t, {
        from: input.previousAssigned,
        to: input.recruiterEmail,
        via: input.attributionSource,
      })})`;
  }
  await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
    VALUES(${input.candidateId},${AIA_EVENT_KINDS.attributionConfirmed},${input.actor.email},${jsonParam(t, metadata)})`;
  await t`UPDATE candidates SET next_action=${AIA_LEADER_TASK}, due_at=COALESCE(due_at, ${due}) WHERE id=${input.candidateId}`;
  await t`INSERT INTO command_audit_events(kind,actor,metadata)
    VALUES(${AIA_EVENT_KINDS.attributionConfirmed},${input.actor.email},${jsonParam(t, {
      candidateId: input.candidateId,
      recruiterEmail: input.recruiterEmail,
      attributionSource: input.attributionSource,
      role: input.actor.role,
    })})`;
}

async function recruitmentConsentGranted(t: Sql, candidateId: string) {
  const [row] = await t`SELECT 1 FROM candidate_consents WHERE candidate_id=${candidateId} AND purpose='recruitment' AND revoked_at IS NULL LIMIT 1`;
  return !!row;
}

async function writeAssistedRead(
  t: Sql,
  actor: StaffActor,
  candidate: Record<string, unknown>,
  input: AiaRegistrationInput,
  action: 'open_assisted' | 'copy_field',
) {
  if (!(await recruitmentConsentGranted(t, input.candidateId))) throw new Error('consent_required');
  const assignedNow = (candidate.assigned_leader as string | null) || null;
  const fields = mapAssistedRegistrationFields({
    name: String(candidate.name || ''),
    email: String(candidate.email || ''),
    phone: String(candidate.phone || ''),
  });
  if (action === 'copy_field') {
    if (!isAiaAssistedFieldId(input.fieldId)) throw new Error('invalid');
    const field = fields.find((item) => item.id === input.fieldId);
    if (!field) throw new Error('invalid');
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
      VALUES(${input.candidateId},${AIA_EVENT_KINDS.assistedCopied},${actor.email},${jsonParam(t, {
        fieldId: field.id,
        read: true,
        officialDecision: false,
        statusUnchanged: true,
        entitlementsUnchanged: true,
      })})`;
    await t`INSERT INTO command_audit_events(kind,actor,metadata)
      VALUES(${AIA_EVENT_KINDS.assistedCopied},${actor.email},${jsonParam(t, {
        candidateId: input.candidateId,
        fieldId: field.id,
        role: actor.role,
      })})`;
    return {
      ok: true as const,
      action,
      fieldId: field.id,
      statusUnchanged: true as const,
      recruiterEmail: assignedNow,
      leaderTask: AIA_LEADER_TASK,
      registrationUrl: candidateAiaHandoff({
        attributed: Boolean(assignedNow),
        registrationUrl: resolveAiaHandoffUrl(assignedNow),
        scrollToForm: true,
      }).registrationUrl,
    };
  }
  await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
    VALUES(${input.candidateId},${AIA_EVENT_KINDS.assistedOpened},${actor.email},${jsonParam(t, {
      read: true,
      fieldCount: fields.length,
      officialDecision: false,
      statusUnchanged: true,
      entitlementsUnchanged: true,
    })})`;
  await t`INSERT INTO command_audit_events(kind,actor,metadata)
    VALUES(${AIA_EVENT_KINDS.assistedOpened},${actor.email},${jsonParam(t, {
      candidateId: input.candidateId,
      role: actor.role,
    })})`;
  const handoff = candidateAiaHandoff({
    attributed: Boolean(assignedNow),
    registrationUrl: resolveAiaHandoffUrl(assignedNow),
    scrollToForm: true,
  });
  return {
    ok: true as const,
    action,
    fields,
    leaderTask: handoff.leaderTask,
    registrationUrl: handoff.registrationUrl,
    recruiterEmail: assignedNow,
    statusUnchanged: true as const,
  };
}

function resolveRecruiter(assignedLeader: string | null): { email: string; attributionSource: AiaAttributionSource } | null {
  if (assignedLeader && assignedLeaderAllowed(assignedLeader)) {
    return { email: assignedLeader, attributionSource: 'assigned_recruiter' };
  }
  const fallback = resolveDefaultAiaRecruiter();
  if (fallback && assignedLeaderAllowed(fallback.staffId)) {
    return { email: fallback.staffId, attributionSource: 'default_recruiter' };
  }
  return null;
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

    const events = await loadTimeline(t, input.candidateId);
    if (!hasFepAttendance(String(c.stage), events)) throw new Error('fep_attendance_required');

    if (action === 'open_assisted' || action === 'copy_field') {
      return writeAssistedRead(t, actor, c as Record<string, unknown>, input, action);
    }

    const previousAssigned = (c.assigned_leader as string | null) || null;
    const recruiter = resolveRecruiter(previousAssigned);
    if (!recruiter) throw new Error('attribution_missing');

    // Unassigned records may use the default recruiter. Assigned records stay with that recruiter.
    if (actor.role !== 'admin' && previousAssigned && previousAssigned !== actor.email) throw new Error('forbidden');
    if (actor.role !== 'admin' && !previousAssigned && recruiter.attributionSource === 'default_recruiter') {
      // Admin applies unassigned fallback. Leaders cannot claim an unowned record via default.
      throw new Error('forbidden');
    }

    let current = deriveAiaRegistration(events);
    const spikePaid = c.spike_paid === true || c.spike_paid === 't' || c.spike_paid === 'true';
    const literacyStatus = String(c.literacy_status || 'not_started');
    const stage = String(c.stage);

    if (action === 'confirm_attribution') {
      const referralSource = sanitizeReferralSource(
        input.referralSource || (recruiter.attributionSource === 'default_recruiter' ? 'default_recruiter' : ''),
      );
      await confirmAttributionOn(t, {
        candidateId: input.candidateId,
        actor,
        recruiterEmail: recruiter.email,
        attributionSource: recruiter.attributionSource,
        referralSource,
        programInterest,
        stage,
        previousAssigned,
      });
      const handoff = handoffFor(recruiter.email, true);
      return {
        ok: true as const,
        action,
        status: current.status,
        recruiterEmail: recruiter.email,
        referralSource,
        attributionSource: recruiter.attributionSource,
        leaderTask: handoff.leaderTask,
        registrationUrl: handoff.registrationUrl,
        stage,
        spikePaid,
        literacyStatus,
      };
    }

    if (!current.attribution) {
      const canFallbackPending = action === 'pending' && !previousAssigned && recruiter.attributionSource === 'default_recruiter';
      if (!canFallbackPending) throw new Error('attribution_missing');
      const referralSource = sanitizeReferralSource(input.referralSource || 'default_recruiter');
      await confirmAttributionOn(t, {
        candidateId: input.candidateId,
        actor,
        recruiterEmail: recruiter.email,
        attributionSource: recruiter.attributionSource,
        referralSource,
        programInterest,
        stage,
        previousAssigned,
      });
      current = {
        status: null,
        attribution: {
          recruiterEmail: recruiter.email,
          referralSource,
          confirmedBy: actor.email,
          confirmedAt: new Date().toISOString(),
          attributionSource: recruiter.attributionSource,
        },
      };
    } else if (previousAssigned && current.attribution.recruiterEmail !== previousAssigned) {
      throw new Error('attribution_stale');
    }

    const attribution = current.attribution;
    if (!attribution) throw new Error('attribution_missing');
    const assignedNow = attribution.recruiterEmail;
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
      recruiterEmail: assignedNow,
      referralSource: attribution.referralSource,
      confirmedBy: attribution.confirmedBy,
      attributionSource: attribution.attributionSource,
      pathway: 'aia_advisor',
      programInterest,
      officialDecision: action === 'verified',
      entitlementsUnchanged: true,
      stageUnchanged: stage,
      spikePaidUnchanged: true,
      literacyUnchanged: true,
      hasRegistrationUrl: Boolean(resolveAiaHandoffUrl(assignedNow)),
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
      VALUES(${kind},${actor.email},${jsonParam(t, {
        candidateId: input.candidateId,
        status: nextStatus,
        role: actor.role,
        source: requestedSource,
        attributionSource: attribution.attributionSource,
      })})`;
    const handoff = handoffFor(assignedNow, true);
    return {
      ok: true as const,
      action,
      status: nextStatus,
      recruiterEmail: assignedNow,
      referralSource: attribution.referralSource,
      attributionSource: attribution.attributionSource,
      leaderTask: handoff.leaderTask,
      registrationUrl: handoff.registrationUrl,
      stage,
      spikePaid,
      literacyStatus,
    };
  });
}

export function isAiaEventKind(kind: string) {
  return Boolean(kindToAiaStatus(kind) || kind === AIA_EVENT_KINDS.attributionConfirmed);
}

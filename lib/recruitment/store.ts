import { canAccess } from '@/lib/gia/access.mjs';
import { deriveAiaRegistration } from '@/lib/mvp01/aia-model';
import { applyCandidateStop, assertWritable, identityIsSuppressed, isStopped } from './suppression';
import { EVENT_KINDS, isEngagementOutcome, isEvaluationNextStep, isLiteracyStatus, isWritableStage, STOP_STAGE } from './stages';
import { manilaDayBounds, parseManilaDateTimeLocal } from './time';
import type {
  AuditEvent,
  CandidateDetail,
  CommandFilters,
  DashboardCounts,
  FollowUpInput,
  HandoffQueueItem,
  QueueCandidate,
  StaffActor,
} from './types';

/** postgres.js tagged template or the PGlite test double. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlTx = any;

const UUID = /^[a-f0-9-]{36}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function scopedLeader(actor: StaffActor, requested?: string | null) {
  if (actor.role === 'leader') return actor.email;
  return requested?.trim() || '';
}

function like(q: string) {
  return `%${q.replace(/[%_]/g, '')}%`;
}

function num(value: unknown) {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;
  return Number.isFinite(n) ? n : 0;
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function flag(value: unknown) {
  return value === true || value === 't' || value === 'true' || value === 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function mapQueueRow(row: Record<string, unknown>): QueueCandidate {
  const escalateAt = iso(row.escalate_at);
  const dueAt = iso(row.due_at);
  const handoffDue = iso(row.handoff_due);
  const handoffState = (row.handoff_state as string | null) || null;
  const now = Date.now();
  const escalated = !!(escalateAt && handoffState === 'open' && new Date(escalateAt).getTime() < now);
  const overdue = !!(dueAt && new Date(dueAt).getTime() < now && row.stage !== STOP_STAGE);
  const created = iso(row.handoff_created) || iso(row.created_at);
  return {
    id: String(row.id),
    name: String(row.name),
    stage: String(row.stage),
    assigned_leader: (row.assigned_leader as string | null) || null,
    next_action: (row.next_action as string | null) || null,
    due_at: dueAt,
    literacy_status: String(row.literacy_status || 'not_started'),
    spike_paid: flag(row.spike_paid),
    created_at: iso(row.created_at) || '',
    source: (row.source as string | null) || null,
    handoff_id: (row.handoff_id as string | null) || null,
    reason: (row.reason as string | null) || null,
    handoff_state: handoffState,
    handoff_due: handoffDue,
    escalate_at: escalateAt,
    resolution: (row.resolution as string | null) || null,
    gia_could_answer: row.gia_could_answer == null ? null : flag(row.gia_could_answer),
    general_answer: (row.general_answer as string | null) || null,
    aging_hours: created ? (now - new Date(created).getTime()) / 36e5 : null,
    escalated,
    overdue,
    evaluation_next_step: (row.evaluation_next_step as string | null) || null,
    evaluated_at: iso(row.evaluated_at),
    evaluated_by: (row.evaluated_by as string | null) || null,
    last_engaged_at: iso(row.last_engaged_at),
    last_engagement_outcome: (row.last_engagement_outcome as string | null) || null,
  };
}

export function eventMatchesMetric(kind: string, metadata: Record<string, unknown>, eventKind: string, stageTo: string | null) {
  if (kind === eventKind && !stageTo) return true;
  if (kind === eventKind && stageTo && (metadata.to === stageTo || eventKind !== EVENT_KINDS.stageChanged)) return true;
  if (kind === EVENT_KINDS.stageChanged && stageTo && metadata.to === stageTo) return true;
  if (eventKind === EVENT_KINDS.fepBooked && kind === EVENT_KINDS.fepBooked) return true;
  if (eventKind === EVENT_KINDS.fepAttended && kind === EVENT_KINDS.fepAttended) return true;
  return false;
}

export async function listSources(sql: Sql) {
  const rows = await sql`SELECT DISTINCT source FROM candidate_identities ORDER BY source`;
  return rows.map((row: Record<string, unknown>) => String(row.source));
}

export function staffDirectory() {
  try {
    const roster = JSON.parse(process.env.RECRUITMENT_STAFF_ROLES || '{}') as Record<string, string>;
    return Object.entries(roster)
      .filter(([, role]) => role === 'leader' || role === 'admin')
      .map(([email, role]) => ({ email, role }));
  } catch {
    return [];
  }
}

export function assignedLeaderAllowed(email: string | null | undefined) {
  if (!email) return true;
  const entry = staffDirectory().find((row) => row.email === email);
  return !!entry;
}

export async function dashboardCounts(sql: Sql, actor: StaffActor, filters: CommandFilters): Promise<DashboardCounts> {
  const bounds = filters.from && filters.to ? manilaDayBounds(filters.from, filters.to) : null;
  if (filters.from && filters.to && !bounds) throw new Error('invalid_range');
  const leader = scopedLeader(actor, filters.leader);
  const source = filters.source?.trim() || '';
  const from = bounds?.from || '1970-01-01T00:00:00.000Z';
  const toExclusive = bounds?.toExclusive || '2999-01-01T00:00:00.000Z';

  const funnel = await sql`
    SELECT
      COUNT(DISTINCT e.candidate_id) FILTER (WHERE e.kind = 'candidate.created') AS new_leads,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'stage.changed' AND e.metadata->>'to' = 'contacted'
      ) AS contacted,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'fep.booked' OR (e.kind = 'stage.changed' AND e.metadata->>'to' = 'fep_booked')
      ) AS fep_booked,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'fep.attended' OR (e.kind = 'stage.changed' AND e.metadata->>'to' = 'fep_attended')
      ) AS fep_attended,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'stage.changed' AND e.metadata->>'to' = 'irecruit_started'
      ) AS applications,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'stage.changed' AND e.metadata->>'to' = 'coded'
      ) AS coded,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'stage.changed' AND e.metadata->>'to' = 'activated'
      ) AS activated,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'evaluation.recorded'
      ) AS evaluated,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind = 'followup.updated' AND e.metadata->>'outcome' IS NOT NULL AND e.metadata->>'outcome' <> ''
      ) AS engaged,
      COUNT(DISTINCT e.candidate_id) FILTER (
        WHERE e.kind IN ('candidate.created','capture.recorded')
      ) AS captured
    FROM candidate_events e
    JOIN candidates c ON c.id = e.candidate_id
    WHERE c.merged_into IS NULL
      AND e.created_at >= ${from}::timestamptz AND e.created_at < ${toExclusive}::timestamptz
      AND (${actor.role} = 'admin' OR c.assigned_leader = ${actor.email})
      AND (${leader} = '' OR c.assigned_leader = ${leader})
      AND (${source} = '' OR EXISTS (
        SELECT 1 FROM candidate_identities i WHERE i.candidate_id = c.id AND i.source = ${source}
      ))`;

  const snapshot = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE c.assigned_leader IS NULL AND c.stage NOT IN ('opt_out','disqualified')
      ) AS unassigned,
      COUNT(*) FILTER (
        WHERE c.due_at IS NOT NULL AND c.due_at < now()
          AND c.stage NOT IN ('opt_out','disqualified','activated')
      ) AS overdue,
      COUNT(*) FILTER (
        WHERE c.evaluated_at IS NULL AND c.stage NOT IN ('opt_out','disqualified','activated')
      ) AS awaiting_evaluation,
      COUNT(*) FILTER (
        WHERE c.registered_at >= ${from}::timestamptz AND c.registered_at < ${toExclusive}::timestamptz
      ) AS registered,
      (
        SELECT COUNT(*) FROM (
          SELECT DISTINCT LEAST(d.left_candidate_id, d.right_candidate_id), GREATEST(d.left_candidate_id, d.right_candidate_id)
          FROM candidate_duplicate_flags d
          JOIN candidates a ON a.id = d.left_candidate_id
          JOIN candidates b ON b.id = d.right_candidate_id
          WHERE d.status = 'needs_review'
            AND (${actor.role} = 'admin')
        ) pairs
      ) AS duplicate_pairs
    FROM candidates c
    WHERE c.merged_into IS NULL
      AND (${actor.role} = 'admin' OR c.assigned_leader = ${actor.email})
      AND (${leader} = '' OR c.assigned_leader = ${leader})
      AND (${source} = '' OR EXISTS (
        SELECT 1 FROM candidate_identities i WHERE i.candidate_id = c.id AND i.source = ${source}
      ))`;

  const f = funnel[0] || {};
  const s = snapshot[0] || {};
  return {
    newLeads: num(f.new_leads),
    contacted: num(f.contacted),
    fepBooked: num(f.fep_booked),
    fepAttended: num(f.fep_attended),
    applications: num(f.applications),
    coded: num(f.coded),
    activated: num(f.activated),
    evaluated: num(f.evaluated),
    engaged: num(f.engaged),
    captured: num(f.captured),
    registered: num(s.registered),
    duplicatePairs: num(s.duplicate_pairs),
    unassigned: num(s.unassigned),
    overdueFollowups: num(s.overdue),
    awaitingEvaluation: num(s.awaiting_evaluation),
  };
}

export async function listCandidates(sql: Sql, actor: StaffActor, filters: CommandFilters): Promise<QueueCandidate[]> {
  const q = (filters.q || '').trim().slice(0, 80);
  const stage = filters.stage?.trim() || '';
  const leader = scopedLeader(actor, filters.leader);
  const source = filters.source?.trim() || '';
  const rows = await sql`
    SELECT
      c.id, c.name, c.stage, c.assigned_leader, c.next_action, c.due_at,
      c.literacy_status, c.spike_paid, c.created_at,
      c.evaluation_next_step, c.evaluated_at, c.evaluated_by, c.last_engaged_at, c.last_engagement_outcome,
      (SELECT i.source FROM candidate_identities i WHERE i.candidate_id = c.id ORDER BY i.source LIMIT 1) AS source,
      h.id AS handoff_id, h.reason, h.state AS handoff_state, h.due_at AS handoff_due,
      h.escalate_at, h.resolution, h.gia_could_answer, h.general_answer, h.created_at AS handoff_created
    FROM candidates c
    LEFT JOIN candidate_handoffs h ON h.id = (
      SELECT hh.id FROM candidate_handoffs hh
      WHERE hh.candidate_id = c.id
      ORDER BY CASE WHEN hh.state IN ('open','acknowledged') THEN 0 ELSE 1 END, hh.created_at DESC
      LIMIT 1
    )
    WHERE c.merged_into IS NULL
      AND (${actor.role} = 'admin' OR c.assigned_leader = ${actor.email})
      AND (${q} = '' OR c.name ILIKE ${like(q)})
      AND (${stage} = '' OR c.stage = ${stage})
      AND (${leader} = '' OR c.assigned_leader = ${leader})
      AND (${source} = '' OR EXISTS (
        SELECT 1 FROM candidate_identities i WHERE i.candidate_id = c.id AND i.source = ${source}
      ))
    ORDER BY
      CASE
        WHEN h.state = 'open' AND h.escalate_at < now() THEN 0
        WHEN c.due_at IS NOT NULL AND c.due_at < now() AND c.stage NOT IN ('opt_out','disqualified','activated') THEN 1
        ELSE 2
      END,
      c.due_at NULLS LAST,
      c.created_at DESC
    LIMIT 200`;
  const seen = new Set<string>();
  return (rows as Record<string, unknown>[]).map(mapQueueRow).filter((row: QueueCandidate) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/** Unconsented urgent rows are admin-only and flagged unassigned. Leaders never inherit them. */
export async function listHandoffs(sql: Sql, actor: StaffActor, filters: CommandFilters): Promise<HandoffQueueItem[]> {
  const leader = scopedLeader(actor, filters.leader);
  const source = filters.source?.trim() || '';
  const rows = await sql`
    SELECT h.id, h.candidate_id, c.name, h.reason, h.state, h.due_at, h.escalate_at, c.assigned_leader,
      h.consented, h.program, h.visitor_identity, h.created_at
    FROM candidate_handoffs h
    LEFT JOIN candidates c ON c.id = h.candidate_id
    WHERE h.state IN ('open','acknowledged')
      AND (c.id IS NULL OR c.merged_into IS NULL)
      AND (
        ${actor.role} = 'admin'
        OR c.assigned_leader = ${actor.email}
      )
      AND (${leader} = '' OR c.assigned_leader = ${leader})
      AND (${source} = '' OR (c.id IS NOT NULL AND EXISTS (
        SELECT 1 FROM candidate_identities i WHERE i.candidate_id = c.id AND i.source = ${source}
      )))
    ORDER BY h.escalate_at ASC
    LIMIT 100`;
  const now = Date.now();
  return rows.map((row: Record<string, unknown>) => {
    const due = iso(row.due_at) || '';
    const escalate = iso(row.escalate_at) || '';
    const consented = row.consented !== false && row.consented !== 'f' && row.consented !== 'false';
    return {
      id: String(row.id),
      candidate_id: row.candidate_id ? String(row.candidate_id) : null,
      name: row.name ? String(row.name) : 'Unconsented visitor',
      reason: String(row.reason),
      state: String(row.state),
      due_at: due,
      escalate_at: escalate,
      assigned_leader: (row.assigned_leader as string | null) || null,
      escalated: !!(escalate && new Date(escalate).getTime() < now && row.state === 'open'),
      overdue: !!(due && new Date(due).getTime() < now),
      consented,
      program: row.program == null ? null : String(row.program),
      visitor_identity: row.visitor_identity == null ? null : String(row.visitor_identity).slice(0, 8),
      created_at: iso(row.created_at) || '',
      unassigned: !consented && String(row.reason) === 'urgent',
    };
  });
}

export async function getCandidate(sql: Sql, actor: StaffActor, id: string) {
  if (!isUuid(id)) return null;
  const rows = await sql`
    SELECT
      c.id, c.name, c.email, c.phone, c.stage, c.assigned_leader, c.next_action, c.due_at,
      c.literacy_status, c.spike_paid, c.created_at, c.program_interest, c.versa_lead_ref,
      c.email_verified, c.phone_verified,
      c.evaluation_next_step, c.evaluated_at, c.evaluated_by, c.last_engaged_at, c.last_engagement_outcome,
      c.campaign, c.capture_channel, c.registered_at,
      (SELECT i.source FROM candidate_identities i WHERE i.candidate_id = c.id ORDER BY i.source LIMIT 1) AS source,
      (SELECT m.spike_learner_ref FROM versa_lead_map m WHERE m.candidate_id = c.id ORDER BY m.created_at LIMIT 1) AS spike_learner_ref,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM candidate_consents s
          WHERE s.candidate_id = c.id AND s.purpose='recruitment' AND s.revoked_at IS NULL
        ) THEN 'granted'
        WHEN EXISTS (
          SELECT 1 FROM candidate_consents s
          WHERE s.candidate_id = c.id AND s.purpose='recruitment'
        ) THEN 'revoked'
        ELSE 'unknown'
      END AS consent_status,
      h.id AS handoff_id, h.reason, h.state AS handoff_state, h.due_at AS handoff_due,
      h.escalate_at, h.resolution, h.gia_could_answer, h.general_answer, h.created_at AS handoff_created
    FROM candidates c
    LEFT JOIN candidate_handoffs h ON h.id = (
      SELECT hh.id FROM candidate_handoffs hh
      WHERE hh.candidate_id = c.id
      ORDER BY CASE WHEN hh.state IN ('open','acknowledged') THEN 0 ELSE 1 END, hh.created_at DESC
      LIMIT 1
    )
    WHERE c.id = ${id}
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  const allowed = canAccess(actor, { assignedLeader: row.assigned_leader || null });
  if (!allowed) {
    const error = new Error('forbidden');
    throw error;
  }
  const base = mapQueueRow(row);
  const detail: CandidateDetail = {
    ...base,
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    versa_lead_ref: (row.versa_lead_ref as string | null) || null,
    spike_learner_ref: (row.spike_learner_ref as string | null) || null,
    program_interest: (row.program_interest as string | null) || null,
    email_verified: flag(row.email_verified),
    phone_verified: flag(row.phone_verified),
    consent_status: (['granted', 'revoked', 'unknown'].includes(String(row.consent_status))
      ? String(row.consent_status)
      : 'unknown') as CandidateDetail['consent_status'],
    campaign: (row.campaign as string | null) || null,
    capture_channel: (row.capture_channel as string | null) || null,
    registered_at: iso(row.registered_at),
  };
  const events = (await sql`
    SELECT id, kind, actor, metadata, created_at
    FROM candidate_events
    WHERE candidate_id = ${id}
    ORDER BY created_at DESC
    LIMIT 100
  `).map((event: Record<string, unknown>) => ({
    id: String(event.id),
    kind: String(event.kind),
    actor: String(event.actor),
    metadata: asRecord(event.metadata),
    created_at: iso(event.created_at) || '',
  })) as AuditEvent[];
  const identities = (await sql`SELECT source, external_id FROM candidate_identities WHERE candidate_id = ${id}`).map((identity: Record<string, unknown>) => ({
    source: String(identity.source),
  }));
  const prefsRows = await sql`SELECT channel, allowed FROM candidate_channel_prefs WHERE candidate_id = ${id}`;
  const channel_prefs: Record<string, boolean> = { email: false, sms: false, voice: false, gia: false };
  for (const pref of prefsRows as Record<string, unknown>[]) {
    channel_prefs[String(pref.channel)] = pref.allowed === true || pref.allowed === 't' || pref.allowed === 'true';
  }
  detail.channel_prefs = channel_prefs;
  const aia = deriveAiaRegistration(events);
  detail.aia_registration_status = aia.status;
  detail.aia_attribution = aia.attribution;
  return { candidate: detail, events, identities };
}

async function emit(t: SqlTx, candidateId: string, kind: string, actor: string, metadata: Record<string, unknown>) {
  await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${candidateId},${kind},${actor},${t.json(metadata)})`;
}

export async function saveFollowUp(sql: Sql, actor: StaffActor, input: FollowUpInput) {
  if (!isUuid(input.id)) throw new Error('invalid');
  if (!isWritableStage(input.stage)) throw new Error('invalid');
  if (typeof input.nextAction !== 'string' || input.nextAction.length > 500) throw new Error('invalid');
  if (typeof input.resolution !== 'string' || input.resolution.length > 2000) throw new Error('invalid');
  if (typeof input.generalAnswer !== 'string' || input.generalAnswer.length > 2000) throw new Error('invalid');
  if (input.handoffId && !isUuid(input.handoffId)) throw new Error('invalid');
  if (input.literacyStatus && !isLiteracyStatus(input.literacyStatus)) throw new Error('invalid');
  const assignedLeader = input.assignedLeader?.trim() || null;
  if (assignedLeader && !assignedLeaderAllowed(assignedLeader)) throw new Error('invalid');
  let dueAt: string | null | undefined;
  if (input.dueAtProvided) {
    if (!input.dueAt) dueAt = null;
    else if (typeof input.dueAt !== 'string' || !Number.isFinite(Date.parse(input.dueAt))) throw new Error('invalid');
    else dueAt = new Date(input.dueAt).toISOString();
  }

  await sql.begin(async (transaction: SqlTx) => {
    const t = transaction;
    const [c] = await t`SELECT * FROM candidates WHERE id=${input.id} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) AND merged_into IS NULL FOR UPDATE`;
    if (!c) throw new Error('forbidden');
    assertWritable(c as { stage: string });
    if (await identityIsSuppressed(t, `candidate:${input.id}`)) throw new Error('suppressed');
    if (actor.role !== 'admin' && input.spikePaidProvided) throw new Error('forbidden');
    // Leaders cannot reassign. Disabled form fields omit the value, so keep the current owner.
    if (actor.role !== 'admin') {
      if (assignedLeader && assignedLeader !== (c.assigned_leader || null)) throw new Error('forbidden');
    }
    const nextAssigned = actor.role === 'admin' ? assignedLeader : (c.assigned_leader || null);

    const nextLiteracy = input.literacyStatus || c.literacy_status || 'not_started';
    const nextPaid = input.spikePaidProvided ? !!input.spikePaid : flag(c.spike_paid);
    const nextDue = input.dueAtProvided ? dueAt : iso(c.due_at);
    const outcome = input.engagementOutcome && isEngagementOutcome(input.engagementOutcome)
      ? input.engagementOutcome
      : null;
    if (input.engagementOutcome && !outcome) throw new Error('invalid');
    const engagedAt = outcome ? new Date().toISOString() : iso(c.last_engaged_at);
    const nextOutcome = outcome || (c.last_engagement_outcome as string | null) || null;

    await t`UPDATE candidates SET
      stage=${input.stage},
      assigned_leader=${nextAssigned},
      next_action=${input.nextAction},
      due_at=${nextDue || null},
      literacy_status=${nextLiteracy},
      spike_paid=${nextPaid},
      last_engaged_at=${engagedAt || null},
      last_engagement_outcome=${nextOutcome}
      WHERE id=${input.id}`;

    if (input.handoffId) {
      await t`UPDATE candidate_handoffs SET
        state=${input.resolve ? 'resolved' : 'acknowledged'},
        resolution=${input.resolution},
        gia_could_answer=${input.giaCouldAnswer === true},
        general_answer=${input.generalAnswer}
        WHERE id=${input.handoffId} AND candidate_id=${input.id}`;
    }

    if (c.stage !== input.stage) {
      await emit(t, input.id, EVENT_KINDS.stageChanged, actor.email, { from: c.stage, to: input.stage });
      if (input.stage === 'fep_booked') await emit(t, input.id, EVENT_KINDS.fepBooked, actor.email, { via: 'command' });
      if (input.stage === 'fep_attended') await emit(t, input.id, EVENT_KINDS.fepAttended, actor.email, { via: 'command' });
    }
    if ((c.assigned_leader || null) !== nextAssigned) {
      await emit(t, input.id, EVENT_KINDS.assignmentChanged, actor.email, { from: c.assigned_leader || null, to: nextAssigned });
    }
    await emit(t, input.id, EVENT_KINDS.followupUpdated, actor.email, {
      stage: input.stage,
      handoffId: input.handoffId || null,
      resolved: !!input.resolve,
      duePreserved: !input.dueAtProvided,
      outcome,
    });
  });
}

export async function recordEvaluation(
  sql: Sql,
  actor: StaffActor,
  input: { id: string; suggestedNextStep: string; note?: string },
) {
  if (!isUuid(input.id)) throw new Error('invalid');
  if (!isEvaluationNextStep(input.suggestedNextStep)) throw new Error('invalid');
  const note = (input.note || '').trim().slice(0, 200);
  await sql.begin(async (transaction: SqlTx) => {
    const t = transaction;
    const [c] = await t`SELECT * FROM candidates WHERE id=${input.id} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) AND merged_into IS NULL FOR UPDATE`;
    if (!c) throw new Error('forbidden');
    assertWritable(c as { stage: string });
    if (await identityIsSuppressed(t, `candidate:${input.id}`)) throw new Error('suppressed');
    const at = new Date().toISOString();
    await t`UPDATE candidates SET
      evaluation_next_step=${input.suggestedNextStep},
      evaluated_at=${at},
      evaluated_by=${actor.email}
      WHERE id=${input.id}`;
    await emit(t, input.id, EVENT_KINDS.evaluationRecorded, actor.email, {
      suggestedNextStep: input.suggestedNextStep,
      note,
      stageUnchanged: String(c.stage),
    });
    await t`INSERT INTO command_audit_events(kind,actor,metadata)
      VALUES(${EVENT_KINDS.evaluationRecorded},${actor.email},${t.json({ candidateId: input.id, suggestedNextStep: input.suggestedNextStep, role: actor.role })})`;
  });
}

export async function stopCandidate(sql: Sql, actor: StaffActor, id: string) {
  if (!isUuid(id)) throw new Error('invalid');
  await sql.begin(async (transaction: SqlTx) => {
    const t = transaction;
    const [c] = await t`SELECT * FROM candidates WHERE id=${id} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) FOR UPDATE`;
    if (!c) throw new Error('forbidden');
    await applyCandidateStop(t, {
      candidateId: id,
      actor: actor.email,
      currentStage: String(c.stage),
    });
  });
}

export function parseFollowUpBody(body: Record<string, unknown>): FollowUpInput {
  const dueAtProvided = Object.prototype.hasOwnProperty.call(body, 'dueAt');
  const spikePaidProvided = Object.prototype.hasOwnProperty.call(body, 'spikePaid');
  let dueAt: string | null | undefined;
  if (dueAtProvided) {
    if (body.dueAt == null || body.dueAt === '') dueAt = null;
    else if (typeof body.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.dueAt)) {
      dueAt = parseManilaDateTimeLocal(body.dueAt) || undefined;
      if (!dueAt) throw new Error('invalid');
    } else if (typeof body.dueAt === 'string') dueAt = body.dueAt;
    else throw new Error('invalid');
  }
  return {
    id: String(body.id || ''),
    stage: String(body.stage || ''),
    assignedLeader: body.assignedLeader == null ? null : String(body.assignedLeader),
    nextAction: typeof body.nextAction === 'string' ? body.nextAction : '',
    dueAt,
    dueAtProvided,
    resolution: typeof body.resolution === 'string' ? body.resolution : '',
    generalAnswer: typeof body.generalAnswer === 'string' ? body.generalAnswer : '',
    giaCouldAnswer: body.giaCouldAnswer === true,
    resolve: body.resolve === true,
    handoffId: body.handoffId ? String(body.handoffId) : null,
    literacyStatus: body.literacyStatus == null ? undefined : String(body.literacyStatus),
    spikePaid: body.spikePaid === true,
    spikePaidProvided,
    engagementOutcome: typeof body.engagementOutcome === 'string' && body.engagementOutcome
      ? body.engagementOutcome
      : null,
  };
}

export function parseEvaluationBody(body: Record<string, unknown>) {
  return {
    id: String(body.id || ''),
    suggestedNextStep: String(body.suggestedNextStep || ''),
    note: typeof body.note === 'string' ? body.note : '',
  };
}

export { isStopped, canAccess };

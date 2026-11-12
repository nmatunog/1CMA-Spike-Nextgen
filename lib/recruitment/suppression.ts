/**
 * Global STOP / suppression core for the NEXT RIDE Command Center (CC-02a).
 *
 * G1 (GIA) should consume this module instead of duplicating opt-out SQL.
 * Stable API — keep signatures additive:
 *
 *   STOP_STAGE, STOP_EVENT
 *   isStopped(candidate)
 *   assertWritable(candidate)        throws Error('suppressed')
 *   identityIsSuppressed(t, identity)
 *   applyCandidateStop(t, params)
 *
 * Rules (NEXO #27):
 *   - Opt-out on any channel stops all channels.
 *   - Consent is never inferred; STOP always revokes remaining consents.
 *   - Ordinary stage PATCH must not undo STOP (enforced in SQL + this helper).
 *   - Reuses gia_suppressions + candidate_events; no parallel tables.
 *   - Actor is a staff id or 'gia'. Never put candidate PII in metadata or logs.
 */
import { STOP_EVENT, STOP_STAGE } from './stages';

export { STOP_EVENT, STOP_STAGE };

/** postgres.js tagged template or the PGlite test double. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxSql = any;

export type StoppableCandidate = { id: string; stage: string };

export function isStopped(candidate: { stage?: string | null } | null | undefined) {
  return candidate?.stage === STOP_STAGE;
}

export function assertWritable(candidate: { stage?: string | null } | null | undefined) {
  if (!candidate || isStopped(candidate)) {
    const error = new Error('suppressed');
    throw error;
  }
}

function jsonParam(t: TxSql, value: unknown) {
  return t.json ? t.json(value) : JSON.stringify(value);
}

/**
 * True when this channel identity is globally suppressed: either listed in
 * gia_suppressions, or linked to a candidate whose stage is opt_out.
 * Source is not filtered — opt-out on any channel stops all channels.
 */
export async function identityIsSuppressed(t: TxSql, identity: string) {
  const rows = await t`
    SELECT 1 FROM gia_suppressions WHERE identity=${identity}
    UNION ALL
    SELECT 1 FROM candidates c
      JOIN candidate_identities i ON i.candidate_id = c.id
     WHERE i.external_id=${identity} AND c.stage=${STOP_STAGE}
    LIMIT 1`;
  return rows.length > 0;
}

export type ApplyStopParams = {
  candidateId: string;
  actor: string;
  currentStage: string;
  extraIdentities?: string[];
};

/**
 * Apply a global STOP to a canonical candidate.
 * - Sets stage to opt_out, clears follow-up, revokes consents, cancels active handoffs.
 * - Inserts every linked identity into gia_suppressions.
 * - Appends a single opt_out event (idempotent if already stopped).
 */
export async function applyCandidateStop(t: TxSql, params: ApplyStopParams) {
  const alreadyStopped = params.currentStage === STOP_STAGE;
  await t`UPDATE candidates SET stage=${STOP_STAGE}, next_action=NULL, due_at=NULL WHERE id=${params.candidateId}`;
  await t`UPDATE candidate_consents SET revoked_at=now() WHERE candidate_id=${params.candidateId} AND revoked_at IS NULL`;
  await t`UPDATE candidate_handoffs SET state='cancelled' WHERE candidate_id=${params.candidateId} AND state IN ('open','acknowledged')`;
  await t`INSERT INTO gia_suppressions(identity) VALUES(${`candidate:${params.candidateId}`}) ON CONFLICT DO NOTHING`;
  await t`INSERT INTO gia_suppressions(identity) SELECT external_id FROM candidate_identities WHERE candidate_id=${params.candidateId} ON CONFLICT DO NOTHING`;
  for (const identity of params.extraIdentities || []) {
    await t`INSERT INTO gia_suppressions(identity) VALUES(${identity}) ON CONFLICT DO NOTHING`;
  }
  if (!alreadyStopped) {
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${params.candidateId},${STOP_EVENT},${params.actor},${jsonParam(t, { channel: 'all' })})`;
  }
  return { alreadyStopped };
}

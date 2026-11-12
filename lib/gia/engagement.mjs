// GIA engagement adapter aligned to C1 `docs/mvp01/interfaces.md` @ eefc126.
// Visitor timeline writes go through `recordGiaVisitorEngagement` / 0008.
// G1 never calls the staff HTTP engagement route. `fep.attended` is refused.

import { looksLikeSecretToken, sanitizeEngagementMetadata as sanitizeC1Metadata } from '../mvp01/engage';

/** Documented C1 kinds (`GIA_ENGAGEMENT_KINDS`). G1 never emits `fep.attended`. */
export const GIA_ENGAGEMENT_KINDS = Object.freeze([
  'gia.conversation',
  'gia.handoff',
  'literacy.interest',
  'fep.booked',
  'fep.attended',
]);

export const G1_EMITTED_KINDS = Object.freeze([
  'gia.conversation',
  'gia.handoff',
  'literacy.interest',
  'fep.booked',
]);

export const ENGAGEMENT_METADATA_KEYS = Object.freeze(['intent', 'citation']);
export const ENGAGEMENT_METADATA_MAX = 80;

export const GIA_ENGAGEMENT = Object.freeze({
  conversation: 'gia.conversation',
  handoff: 'gia.handoff',
  literacyInterest: 'literacy.interest',
  fepBooked: 'fep.booked',
  fepAttended: 'fep.attended',
});

const TOOL_KINDS = Object.freeze(['gia.handoff', 'fep.booked']);

export { looksLikeSecretToken };

export function isDocumentedEngagementKind(kind) {
  return GIA_ENGAGEMENT_KINDS.includes(kind);
}

export function g1MayEmit(kind) {
  return G1_EMITTED_KINDS.includes(kind);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asCitationString(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.id === 'string') return value.id.trim();
  return '';
}

/** Pick C1's intent/citation string allowlist. Extra keys and objects are dropped, never persisted. */
export function flattenEngagementMetadata(spec = {}) {
  const src = asObject(spec.metadata);
  const intent = typeof src.intent === 'string' ? src.intent : (typeof spec.intent === 'string' ? spec.intent : '');
  const citation = asCitationString(src.citation ?? spec.citation);
  const out = {};
  if (intent.trim()) out.intent = intent.trim();
  if (citation) out.citation = citation;
  return out;
}

export function sanitizeEngagementMetadata(raw) {
  const picked = flattenEngagementMetadata({ metadata: asObject(raw), intent: asObject(raw).intent, citation: asObject(raw).citation });
  return sanitizeC1Metadata(picked);
}

function invalidFromC1(err) {
  return err instanceof Error && err.message === 'invalid';
}

/**
 * C1 payload: `{ candidateId, kind, actor, metadata }` with string intent/citation ≤ 80.
 * G1 always sets actor to `gia`. Unknown kinds and `fep.attended` are refused.
 * @returns {{ ok: true, event: { candidateId: string|null, kind: string, actor: string, metadata: Record<string,string> } } | { ok: false, error: string }}
 */
export function buildEngagementEvent({ candidateId, kind, actor, metadata } = {}) {
  if (!isDocumentedEngagementKind(kind)) return { ok: false, error: 'invalid_kind' };
  if (!g1MayEmit(kind)) return { ok: false, error: 'kind_not_allowed' };
  void actor;
  const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
  try {
    return {
      ok: true,
      event: {
        candidateId: id,
        kind,
        actor: 'gia',
        metadata: sanitizeEngagementMetadata(metadata),
      },
    };
  } catch (err) {
    if (invalidFromC1(err)) return { ok: false, error: 'invalid' };
    throw err;
  }
}

export function callerOwnsCandidate(callerCandidateId, targetCandidateId) {
  if (targetCandidateId == null || targetCandidateId === '') return true;
  if (typeof targetCandidateId !== 'string' || !targetCandidateId.trim()) return false;
  if (typeof callerCandidateId !== 'string' || !callerCandidateId) return false;
  return callerCandidateId === targetCandidateId.trim();
}

export function engagementKindFor({ action, intent, citation } = {}) {
  if (action === 'opt_out' || intent === 'opt_out') return null;
  if (action === 'book_fep') return GIA_ENGAGEMENT.fepBooked;
  if (action === 'request_leader' || intent === 'request_leader') return GIA_ENGAGEMENT.handoff;
  const citationId = asCitationString(citation);
  if (intent === 'next_step' || intent === 'answer' || citationId.startsWith('KP-LIT-')) {
    return GIA_ENGAGEMENT.literacyInterest;
  }
  return null;
}

function alreadyRecorded(rows, event) {
  if (!TOOL_KINDS.includes(event.kind)) return false;
  return rows.some(row => row.kind === event.kind && (
    (event.candidateId && row.candidateId === event.candidateId)
    || (!event.candidateId && event.identity && row.identity === event.identity)
  ));
}

function listScope(scope) {
  if (typeof scope === 'string') return { identity: scope.trim(), candidateId: '' };
  if (scope && typeof scope === 'object') {
    const identity = typeof scope.identity === 'string' ? scope.identity.trim() : '';
    const candidateId = typeof scope.candidateId === 'string' ? scope.candidateId.trim() : '';
    return { identity, candidateId };
  }
  return { identity: '', candidateId: '' };
}

const MEMORY_ENGAGEMENT_LIMIT = 256;

export function createMemoryEngagementPort({ limit = MEMORY_ENGAGEMENT_LIMIT } = {}) {
  const cap = Number.isInteger(limit) && limit > 0 ? limit : MEMORY_ENGAGEMENT_LIMIT;
  const rows = [];
  return {
    id: 'memory',
    async record(event) {
      const built = buildEngagementEvent(event);
      if (!built.ok) return built;
      const stored = { ...built.event, identity: event.identity || null, at: event.at || new Date().toISOString() };
      if (alreadyRecorded(rows, stored)) return { ok: true, event: stored, duplicate: true };
      rows.push(stored);
      if (rows.length > cap) rows.splice(0, rows.length - cap);
      return { ok: true, event: stored };
    },
    async list(scope) {
      const { identity, candidateId } = listScope(scope);
      if (!identity) throw new Error('unscoped_list');
      return rows.filter(row => row.identity === identity && (!candidateId || row.candidateId === candidateId));
    },
    async clear() { rows.length = 0; },
  };
}

let port = createMemoryEngagementPort();

export function engagementPort() {
  return port;
}

export function setEngagementPort(next) {
  port = next;
}

export function resetEngagementPort() {
  port = createMemoryEngagementPort();
}

/**
 * @returns {Promise<{ ok: true, events: Array<{ candidateId: string|null, kind: string, actor: string, metadata: Record<string,string> }> } | { ok: false, error: string }>}
 */
export async function emitGiaEngagement(tx, identity, spec = {}) {
  const candidate = tx?.findCandidate ? await tx.findCandidate() : null;
  const callerCandidateId = candidate?.id || null;
  if (!callerOwnsCandidate(callerCandidateId, spec.candidateId)) {
    return { ok: false, error: 'out_of_scope' };
  }
  const stopped = tx?.suppressed ? await tx.suppressed() : false;
  const kinds = [];
  if (spec.conversation === true) kinds.push(GIA_ENGAGEMENT.conversation);
  const classified = engagementKindFor(spec);
  if (classified && !(stopped && classified === GIA_ENGAGEMENT.literacyInterest)) kinds.push(classified);
  let metadata;
  try {
    metadata = sanitizeEngagementMetadata(flattenEngagementMetadata(spec));
  } catch (err) {
    if (invalidFromC1(err)) return { ok: false, error: 'invalid' };
    throw err;
  }
  const events = [];
  for (const kind of kinds) {
    const built = buildEngagementEvent({
      candidateId: callerCandidateId,
      kind,
      actor: 'gia',
      metadata,
    });
    if (!built.ok) continue;
    await port.record({ ...built.event, identity });
    if (callerCandidateId && tx?.recordEngagement) await tx.recordEngagement(built.event.kind, built.event.metadata);
    events.push(built.event);
  }
  return { ok: true, events };
}

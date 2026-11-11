// GIA engagement adapter aligned to C1 `docs/mvp01/interfaces.md` @ f8d6e5f.
// C1 schema (0008) and HTTP ingest are not used yet — Q1 blocked C1 on an
// engagement-route IDOR and C1 is changing that path. This port stays swappable.
// Writes today: in-memory, plus identity-scoped `candidate_events` when the
// GIA session already has a candidate. Never call C1's engagement HTTP route.

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
export const ENGAGEMENT_CITATION_KEYS = Object.freeze(['id', 'version', 'source']);

export const GIA_ENGAGEMENT = Object.freeze({
  conversation: 'gia.conversation',
  handoff: 'gia.handoff',
  literacyInterest: 'literacy.interest',
  fepBooked: 'fep.booked',
  fepAttended: 'fep.attended',
});

const TOOL_KINDS = Object.freeze(['gia.handoff', 'fep.booked']);

function asTrimmedString(value, max) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > max) return null;
  return v;
}

export function isDocumentedEngagementKind(kind) {
  return GIA_ENGAGEMENT_KINDS.includes(kind);
}

export function g1MayEmit(kind) {
  return G1_EMITTED_KINDS.includes(kind);
}

export function sanitizeEngagementMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = {};
  const intent = asTrimmedString(metadata.intent, 64);
  if (intent) out.intent = intent;
  if (metadata.citation && typeof metadata.citation === 'object' && !Array.isArray(metadata.citation)) {
    const citation = {};
    const id = asTrimmedString(metadata.citation.id, 32);
    const version = asTrimmedString(metadata.citation.version, 16);
    const source = asTrimmedString(metadata.citation.source, 256);
    if (id) citation.id = id;
    if (version) citation.version = version;
    if (source) citation.source = source;
    if (Object.keys(citation).length) out.citation = citation;
  }
  return out;
}

/**
 * C1 payload: `{ candidateId, kind, actor, metadata }`.
 * G1 always sets actor to `gia`. Unknown kinds and `fep.attended` are refused.
 * @returns {{ ok: true, event: { candidateId: string|null, kind: string, actor: string, metadata: object } } | { ok: false, error: string }}
 */
export function buildEngagementEvent({ candidateId, kind, actor, metadata } = {}) {
  if (!isDocumentedEngagementKind(kind)) return { ok: false, error: 'invalid_kind' };
  if (!g1MayEmit(kind)) return { ok: false, error: 'kind_not_allowed' };
  void actor;
  const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
  return {
    ok: true,
    event: {
      candidateId: id,
      kind,
      actor: 'gia',
      metadata: sanitizeEngagementMetadata(metadata),
    },
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * The GIA session identity may write only its bound candidate. An explicit
 * `candidateId` that does not match is out of scope (IDOR guard on G1's side).
 */
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
  if (intent === 'next_step' || intent === 'answer' || String(citation?.id || '').startsWith('KP-LIT-')) {
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

export function createMemoryEngagementPort() {
  const rows = [];
  return {
    id: 'memory',
    async record(event) {
      const built = buildEngagementEvent(event);
      if (!built.ok) return built;
      const stored = { ...built.event, identity: event.identity || null, at: event.at || new Date().toISOString() };
      if (alreadyRecorded(rows, stored)) return { ok: true, event: stored, duplicate: true };
      rows.push(stored);
      return { ok: true, event: stored };
    },
    async list(identity) {
      return rows.filter(row => !identity || row.identity === identity);
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
 * @returns {Promise<{ ok: true, events: Array<{ candidateId: string|null, kind: string, actor: string, metadata: object }> } | { ok: false, error: string }>}
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
  const events = [];
  const metadata = { intent: spec.intent, citation: spec.citation, ...asObject(spec.metadata) };
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

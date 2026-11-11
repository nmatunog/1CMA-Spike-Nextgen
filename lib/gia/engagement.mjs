// GIA engagement events for the candidate activity timeline.
// C1 will publish docs/mvp01/interfaces.md with migration 0008. Until then
// this port records in memory and, when a candidate exists, appends to the
// existing candidate_events table. GIA does not create a parallel schema.

export const GIA_ENGAGEMENT = Object.freeze({
  conversationStarted: 'gia.conversation_started',
  flInterest: 'gia.fl_interest',
  fepGuidance: 'gia.fep_guidance',
  fepBooking: 'gia.fep_booking',
  handoffRequested: 'gia.handoff_requested',
  stop: 'gia.stop',
});

export function createMemoryEngagementPort() {
  const rows = [];
  return {
    id: 'memory',
    async record(event) {
      if (event.kind === GIA_ENGAGEMENT.conversationStarted
        && rows.some(row => row.identity === event.identity && row.kind === event.kind)) {
        return;
      }
      rows.push({
        identity: event.identity,
        candidateId: event.candidateId || null,
        kind: event.kind,
        metadata: event.metadata || {},
        at: event.at || new Date().toISOString(),
      });
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

export function engagementKindFor({ action, intent, citation } = {}) {
  if (action === 'opt_out' || intent === 'opt_out') return GIA_ENGAGEMENT.stop;
  if (action === 'book_fep') return GIA_ENGAGEMENT.fepBooking;
  if (action === 'request_leader' || intent === 'request_leader') return GIA_ENGAGEMENT.handoffRequested;
  if (action === 'list_fep_sessions' || intent === 'list_fep_sessions') return GIA_ENGAGEMENT.fepGuidance;
  if (intent === 'next_step') return GIA_ENGAGEMENT.flInterest;
  if (intent === 'answer' || String(citation?.id || '').startsWith('KP-LIT-')) return GIA_ENGAGEMENT.flInterest;
  return null;
}

export async function emitGiaEngagement(tx, identity, spec = {}) {
  const kinds = [];
  if (spec.conversation !== false) kinds.push(GIA_ENGAGEMENT.conversationStarted);
  const classified = engagementKindFor(spec);
  if (classified) kinds.push(classified);
  const candidate = tx?.findCandidate ? await tx.findCandidate() : null;
  for (const kind of kinds) {
    await port.record({
      identity,
      candidateId: candidate?.id || null,
      kind,
      metadata: spec.metadata || {},
    });
    if (tx?.recordEngagement) await tx.recordEngagement(kind, spec.metadata || {});
  }
}

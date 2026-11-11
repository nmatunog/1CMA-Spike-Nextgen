// Retention policy config only. No destructive jobs against real or synthetic data.
export const GIA_RETENTION = Object.freeze({
  transcripts: Object.freeze({
    clock: 'last_contact',
    retainMonths: 24,
    store: 'gia_turns.message_text',
    rawUploads: 'discarded_never_stored',
    destructiveJobs: false,
  }),
  audit: Object.freeze({
    retain: 'life_of_record',
    store: Object.freeze(['candidate_events', 'gia_turns']),
    destructiveJobs: false,
  }),
  suppression: Object.freeze({
    retain: 'indefinite',
    store: 'gia_suppressions',
    destructiveJobs: false,
    // INTEGRATION SEAM (C1): lib/recruitment/suppression, when added, must keep
    // suppression indefinite. GIA must not add a purge or undo job here.
  }),
});

export function retentionSummary() {
  return {
    transcripts: `${GIA_RETENTION.transcripts.retainMonths} months after last contact`,
    audit: 'life of the candidate/workflow record',
    suppression: 'indefinite',
    destructiveJobs: false,
  };
}

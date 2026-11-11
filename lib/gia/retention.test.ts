import { describe, it, expect } from 'vitest';
import { GIA_RETENTION, retentionSummary } from './retention.mjs';

describe('GIA retention config', () => {
  it('keeps transcripts 24 months, audit for life, suppression indefinite, and forbids destructive jobs', () => {
    expect(GIA_RETENTION.transcripts.retainMonths).toBe(24);
    expect(GIA_RETENTION.transcripts.clock).toBe('last_contact');
    expect(GIA_RETENTION.transcripts.destructiveJobs).toBe(false);
    expect(GIA_RETENTION.audit.retain).toBe('life_of_record');
    expect(GIA_RETENTION.audit.destructiveJobs).toBe(false);
    expect(GIA_RETENTION.suppression.retain).toBe('indefinite');
    expect(GIA_RETENTION.suppression.destructiveJobs).toBe(false);
    expect(retentionSummary().destructiveJobs).toBe(false);
  });
});

import { EVENT_KINDS } from '@/lib/recruitment/stages';

/** RA-SPIKE is the AIA advisor pathway. Interns and free learners are excluded. */
export const AIA_ADVISOR_PROGRAM_INTEREST = 'ra_spike';

export const AIA_LEADER_TASK = 'Help candidate register via your AIA account / iRecruit';

/**
 * Staff-reference public AIA pages. Do not send to recruits.
 * Candidate destinations must be an attributed join-us-now URL with `reference`.
 */
export const AIA_STAFF_REFERENCE_PAGES = [
  'https://www.aia.com.ph/en/financialadvisor/partner-with-the-best',
  'https://www.aia.com.ph/en/financialadvisor/join-us-now',
] as const;

/** @deprecated Use AIA_STAFF_REFERENCE_PAGES. Generic join-us-now is not a candidate destination. */
export const AIA_PUBLIC_LINKS = AIA_STAFF_REFERENCE_PAGES;

export const AIA_EVENT_KINDS = {
  attributionConfirmed: EVENT_KINDS.aiaAttributionConfirmed,
  pending: EVENT_KINDS.aiaRegistrationPending,
  submitted: EVENT_KINDS.aiaRegistrationSubmitted,
  verified: EVENT_KINDS.aiaRegistrationVerified,
  assistedOpened: EVENT_KINDS.aiaAssistedOpened,
  assistedCopied: EVENT_KINDS.aiaAssistedCopied,
} as const;

export const AIA_REGISTRATION_STATES = [
  'aia_registration_pending',
  'aia_registration_submitted',
  'aia_registration_verified',
] as const;

export type AiaRegistrationStatus = (typeof AIA_REGISTRATION_STATES)[number];
export type AiaRegistrationAction =
  | 'confirm_attribution'
  | 'pending'
  | 'submitted'
  | 'verified'
  | 'open_assisted'
  | 'copy_field';
export type AiaRegistrationSource = 'self_report' | 'staff';

export type AiaAttributionSource = 'assigned_recruiter' | 'default_recruiter';

export type AiaAttribution = {
  recruiterEmail: string;
  referralSource: string;
  confirmedBy: string;
  confirmedAt: string;
  attributionSource: AiaAttributionSource;
};

export type AiaTimelineEvent = {
  kind: string;
  actor: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const STATUS_RANK: Record<AiaRegistrationStatus, number> = {
  aia_registration_pending: 1,
  aia_registration_submitted: 2,
  aia_registration_verified: 3,
};

const POST_FEP_STAGES = new Set([
  'fep_attended',
  'irecruit_started',
  'licensing',
  'coded',
  'activated',
]);

export function isAiaAdvisorPathway(programInterest: string | null | undefined) {
  return programInterest === AIA_ADVISOR_PROGRAM_INTEREST;
}

export function aiaStatusRank(status: AiaRegistrationStatus | null | undefined) {
  if (!status) return 0;
  return STATUS_RANK[status] || 0;
}

export function kindToAiaStatus(kind: string): AiaRegistrationStatus | null {
  if (kind === AIA_EVENT_KINDS.pending) return 'aia_registration_pending';
  if (kind === AIA_EVENT_KINDS.submitted) return 'aia_registration_submitted';
  if (kind === AIA_EVENT_KINDS.verified) return 'aia_registration_verified';
  return null;
}

export function stageImpliesFepAttendance(stage: string) {
  return POST_FEP_STAGES.has(stage);
}

export function deriveAiaRegistration(events: AiaTimelineEvent[]) {
  const chronological = [...events].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let attribution: AiaAttribution | null = null;
  let status: AiaRegistrationStatus | null = null;
  for (const event of chronological) {
    if (event.kind === AIA_EVENT_KINDS.attributionConfirmed) {
      const source = event.metadata.attributionSource === 'default_recruiter' ? 'default_recruiter' : 'assigned_recruiter';
      attribution = {
        recruiterEmail: String(event.metadata.recruiterEmail || ''),
        referralSource: String(event.metadata.referralSource || ''),
        confirmedBy: String(event.metadata.confirmedBy || event.actor),
        confirmedAt: String(event.metadata.confirmedAt || event.created_at),
        attributionSource: source,
      };
    }
    const next = kindToAiaStatus(event.kind);
    if (next) status = next;
  }
  return { status, attribution };
}

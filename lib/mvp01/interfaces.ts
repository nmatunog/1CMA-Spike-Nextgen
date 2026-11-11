/**
 * MVP 01 contracts for G1 (GIA) and future Versa intake.
 * Implementations live in lib/mvp01/*.ts. HTTP wrappers are under
 * app/api/recruitment/command/*. Schema: migrations/0008_mvp01_journey.sql.
 *
 * Distinct entities, never collapsed:
 *   Candidate → UserAccount → ProgramEnrollment → ProgramRole
 */

export const CAPTURE_CHANNELS = ['manual', 'csv', 'versa_stub', 'gia_stub', 'gia_web_session'] as const;
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number];

export const COMM_CHANNELS = ['email', 'sms', 'voice', 'gia'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export const CONSENT_STATES = ['granted', 'revoked', 'unknown'] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export const GIA_ENGAGEMENT_KINDS = [
  'gia.conversation',
  'gia.handoff',
  'literacy.interest',
  'fep.booked',
  'fep.attended',
] as const;
export type GiaEngagementKind = (typeof GIA_ENGAGEMENT_KINDS)[number];

export const DUPLICATE_ACTIONS = ['keep', 'link', 'merge'] as const;
export type DuplicateAction = (typeof DUPLICATE_ACTIONS)[number];

export const USER_ACCOUNT_STATUSES = ['pending', 'active', 'disabled'] as const;
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];

export const PROGRAM_CODES = ['literacy', 'fep', 'ra_spike', 'intern'] as const;
export type ProgramCode = (typeof PROGRAM_CODES)[number];

export const ENROLLMENT_STATUSES = ['interested', 'enrolled', 'completed', 'withdrawn'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const PROGRAM_ROLE_CODES = ['learner', 'intern', 'advisor_track'] as const;
export type ProgramRoleCode = (typeof PROGRAM_ROLE_CODES)[number];

export type CaptureInput = {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  campaign?: string;
  versaLeadRef?: string;
  programInterest?: string;
  /** True only with an explicit notice. CSV/import must leave this false. */
  consentGranted?: boolean;
  noticeVersion?: string;
  channelPrefs?: Partial<Record<CommChannel, boolean>>;
  captureChannel?: CaptureChannel;
};

export type CaptureResult = {
  id: string;
  flagged: boolean;
  /** Name-only matches with different email/phone are `possible`, not identity duplicates. */
  flagKind?: 'duplicate' | 'possible';
  consent: ConsentState;
  captureChannel: CaptureChannel;
};

/** Future Versa CSV/API lead. Not implemented in MVP 01. */
export type VersaLeadImport = {
  versaLeadRef: string;
  name: string;
  email?: string;
  phone?: string;
  campaign?: string;
};

/** Future GIA-assisted capture. Not implemented in MVP 01. */
export type GiaAssistedIntake = {
  sessionId: string;
  name: string;
  email?: string;
  noticeVersion: string;
  consentGranted: boolean;
};

export type GiaEngagementEventInput = {
  candidateId: string;
  kind: GiaEngagementKind;
  actor: string;
  metadata?: Record<string, unknown>;
};

export type UserAccountRecord = {
  id: string;
  candidateId: string;
  status: UserAccountStatus;
  createdAt: string;
};

export type ProgramEnrollmentRecord = {
  id: string;
  accountId: string;
  programCode: ProgramCode;
  status: EnrollmentStatus;
  createdAt: string;
};

export type ProgramRoleRecord = {
  id: string;
  enrollmentId: string;
  roleCode: ProgramRoleCode;
  createdAt: string;
};

export type EvaluationSubmitInput = {
  candidateId: string;
  configId: string;
  configVersion: number;
  answers: Record<string, string>;
};

export type DuplicateResolveInput = {
  flagId: string;
  action: DuplicateAction;
  keeperId?: string;
};

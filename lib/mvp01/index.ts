export type {
  CaptureInput,
  CaptureResult,
  GiaAssistedIntake,
  GiaEngagementEventInput,
  ProgramEnrollmentRecord,
  ProgramRoleRecord,
  UserAccountRecord,
  VersaLeadImport,
} from './interfaces';
export {
  CAPTURE_CHANNELS,
  COMM_CHANNELS,
  CONSENT_STATES,
  DUPLICATE_ACTIONS,
  GIA_ENGAGEMENT_KINDS,
  PROGRAM_CODES,
  PROGRAM_ROLE_CODES,
} from './interfaces';
export { MVP01_EVALUATION_CONFIG } from './evaluation-config';
export { captureProspect } from '@/lib/recruitment/import';
export { importVersaLead, giaAssistedIntake } from './stubs';
export { ingestGiaEngagementEvent, recordGiaVisitorEngagement, recordGiaVisitorEngagementOn, canMessage, looksLikeSecretToken, sanitizeEngagementMetadata } from './engage';
export { submitEvaluation, loadActiveEvaluationConfig } from './evaluate';
export { provisionUserAccount, enrollAccount, assignProgramRole } from './accounts';
export {
  AIA_ADVISOR_PROGRAM_INTEREST,
  AIA_ASK_ON_FORM,
  AIA_ASSISTED_CANDIDATE_ON_FORM,
  AIA_ASSISTED_REGISTRATION_FIELDS,
  AIA_EVENT_KINDS,
  AIA_LEADER_TASK,
  AIA_MOBILE_FORMAT_HINT,
  AIA_PUBLIC_LINKS,
  AIA_STAFF_REFERENCE_PAGES,
  appendAiaFormScroll,
  applyAiaRegistration,
  candidateAiaHandoff,
  deriveAiaRegistration,
  isAiaAdvisorPathway,
  isAttributedAiaRegistrationUrl,
  mapAssistedRegistrationFields,
  parseAiaRegistrationBody,
} from './aia-registration';

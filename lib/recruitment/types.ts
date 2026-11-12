export type StaffActor = { email: string; role: 'admin' | 'leader' };

export type CommandFilters = {
  from?: string;
  to?: string;
  source?: string;
  leader?: string;
  q?: string;
  stage?: string;
};

export type DashboardCounts = {
  newLeads: number;
  contacted: number;
  fepBooked: number;
  fepAttended: number;
  applications: number;
  coded: number;
  activated: number;
  evaluated: number;
  engaged: number;
  captured: number;
  registered: number;
  duplicatePairs: number;
  unassigned: number;
  overdueFollowups: number;
  awaitingEvaluation: number;
};

export type QueueCandidate = {
  id: string;
  name: string;
  stage: string;
  assigned_leader: string | null;
  next_action: string | null;
  due_at: string | null;
  literacy_status: string;
  spike_paid: boolean;
  created_at: string;
  source: string | null;
  handoff_id: string | null;
  reason: string | null;
  handoff_state: string | null;
  handoff_due: string | null;
  escalate_at: string | null;
  resolution: string | null;
  gia_could_answer: boolean | null;
  general_answer: string | null;
  aging_hours: number | null;
  escalated: boolean;
  overdue: boolean;
  evaluation_next_step: string | null;
  evaluated_at: string | null;
  evaluated_by: string | null;
  last_engaged_at: string | null;
  last_engagement_outcome: string | null;
};

export type HandoffQueueItem = {
  id: string;
  candidate_id: string | null;
  name: string;
  reason: string;
  state: string;
  due_at: string;
  escalate_at: string;
  assigned_leader: string | null;
  escalated: boolean;
  overdue: boolean;
  consented: boolean;
  program: string | null;
  visitor_identity: string | null;
  created_at: string;
};

export type CandidateDetail = QueueCandidate & {
  email: string;
  phone: string;
  versa_lead_ref?: string | null;
  spike_learner_ref?: string | null;
  program_interest?: string | null;
  email_verified?: boolean;
  phone_verified?: boolean;
  consent_status?: 'granted' | 'revoked' | 'unknown';
  campaign?: string | null;
  capture_channel?: string | null;
  registered_at?: string | null;
  channel_prefs?: Record<string, boolean>;
};

export type DuplicateFlag = {
  id: string;
  matchOn: string;
  /** Name-only matches with different email/phone are possible, not identity duplicates. */
  possible: boolean;
  leftId: string;
  rightId: string;
  leftName: string;
  rightName: string;
};

export type ImportLine = {
  line: number;
  status: 'pending' | 'created' | 'merged' | 'flagged' | 'rejected';
  reason?: string;
  candidateId?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  versaLeadRef?: string;
  spikeLearnerRef?: string;
  programInterest?: string;
  campaign?: string;
  offering?: string;
  codeStatus?: string;
  consentClaimed?: boolean;
};

export type ImportReport = {
  batchId: string;
  dryRun: boolean;
  filename: string;
  sha256: string;
  idempotent: boolean;
  accepted: number;
  rejected: number;
  flagged: number;
  merged: number;
  lines: ImportLine[];
};

export type AuditEvent = {
  id: string;
  kind: string;
  actor: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FollowUpInput = {
  id: string;
  stage: string;
  assignedLeader?: string | null;
  nextAction: string;
  dueAt?: string | null;
  dueAtProvided?: boolean;
  resolution: string;
  generalAnswer: string;
  giaCouldAnswer: boolean;
  resolve: boolean;
  handoffId?: string | null;
  literacyStatus?: string;
  spikePaid?: boolean;
  spikePaidProvided?: boolean;
  engagementOutcome?: string | null;
};

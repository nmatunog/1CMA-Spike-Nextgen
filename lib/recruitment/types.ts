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
  unassigned: number;
  overdueFollowups: number;
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
};

export type HandoffQueueItem = {
  id: string;
  candidate_id: string;
  name: string;
  reason: string;
  state: string;
  due_at: string;
  escalate_at: string;
  assigned_leader: string | null;
  escalated: boolean;
  overdue: boolean;
};

export type CandidateDetail = QueueCandidate & {
  email: string;
  phone: string;
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
};

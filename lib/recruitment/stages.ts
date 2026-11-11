/** Canonical recruitment stages from NEXO #27 / issue #4. Literacy and SPIKE paid are attributes, not stages. */
export const WRITABLE_STAGES = [
  'new_lead',
  'contacted',
  'fep_booked',
  'fep_attended',
  'evaluating',
  'irecruit_started',
  'licensing',
  'coded',
  'activated',
  'not_now',
  'disqualified',
] as const;

export const STOP_STAGE = 'opt_out';
export const STOP_EVENT = 'opt_out';

export const ALL_STAGES = [...WRITABLE_STAGES, STOP_STAGE] as const;

export const TERMINAL_STAGES = ['opt_out', 'disqualified', 'activated'] as const;

export const LITERACY_STATUSES = ['not_started', 'enrolled', 'engaged', 'completed'] as const;

export type WritableStage = (typeof WRITABLE_STAGES)[number];
export type Stage = (typeof ALL_STAGES)[number];
export type LiteracyStatus = (typeof LITERACY_STATUSES)[number];

export function isWritableStage(value: unknown): value is WritableStage {
  return typeof value === 'string' && (WRITABLE_STAGES as readonly string[]).includes(value);
}

export function isLiteracyStatus(value: unknown): value is LiteracyStatus {
  return typeof value === 'string' && (LITERACY_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStage(stage: string) {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

export const EVENT_KINDS = {
  created: 'candidate.created',
  stageChanged: 'stage.changed',
  assignmentChanged: 'assignment.changed',
  followupUpdated: 'followup.updated',
  fepBooked: 'fep.booked',
  fepAttended: 'fep.attended',
  optOut: STOP_EVENT,
  consentGranted: 'consent.granted',
  handoffCreated: 'handoff.created',
  codeStatus: 'code.status',
  importMerged: 'import.merged',
  csvImported: 'csv.imported',
  csvExported: 'csv.exported',
  identityVerified: 'identity.verified',
  manualIntake: 'manual.intake',
} as const;

export const DASHBOARD_METRICS = [
  { key: 'newLeads', label: 'New leads', eventKind: EVENT_KINDS.created, stageTo: null },
  { key: 'contacted', label: 'Contacted', eventKind: EVENT_KINDS.stageChanged, stageTo: 'contacted' },
  { key: 'fepBooked', label: 'FEP booked', eventKind: EVENT_KINDS.fepBooked, stageTo: 'fep_booked' },
  { key: 'fepAttended', label: 'FEP attended', eventKind: EVENT_KINDS.fepAttended, stageTo: 'fep_attended' },
  { key: 'applications', label: 'Applications', eventKind: EVENT_KINDS.stageChanged, stageTo: 'irecruit_started' },
  { key: 'coded', label: 'Coded', eventKind: EVENT_KINDS.stageChanged, stageTo: 'coded' },
  { key: 'activated', label: 'Activated', eventKind: EVENT_KINDS.stageChanged, stageTo: 'activated' },
] as const;

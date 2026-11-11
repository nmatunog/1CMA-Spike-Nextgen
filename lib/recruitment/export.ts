import { EVENT_KINDS } from './stages';
import { toCsv } from './csv';
import { scopedLeader, type Sql, type SqlTx } from './store';
import type { CommandFilters, StaffActor } from './types';

export const EXPORT_COLUMNS = [
  'candidate_id',
  'name',
  'email',
  'phone',
  'stage',
  'assigned_leader',
  'source',
  'versa_lead_ref',
  'spike_learner_ref',
  'program_interest',
  'literacy_status',
  'spike_paid',
  'next_action',
  'due_at',
  'created_at',
  'consent_status',
  'email_verified',
  'phone_verified',
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

export const EXPORT_ROW_CAP = 500;

function jsonParam(t: SqlTx | Sql, value: unknown) {
  return t.json ? t.json(value) : JSON.stringify(value);
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

function flag(value: unknown) {
  return value === true || value === 't' || value === 'true' || value === 1 ? 'true' : 'false';
}

function redactSecret(value: string) {
  if (/code|secret|token|password|otp/i.test(value) && /\d{4,}/.test(value)) return '';
  return value;
}

export async function exportCandidatesCsv(
  sql: Sql,
  actor: StaffActor,
  filters: CommandFilters,
  opts?: { cap?: number },
) {
  const leader = scopedLeader(actor, filters.leader);
  const source = filters.source?.trim() || '';
  const stage = filters.stage?.trim() || '';
  const q = (filters.q || '').trim().slice(0, 80);
  const cap = Math.max(1, Math.floor(opts?.cap ?? EXPORT_ROW_CAP));
  const rows = await sql`
    SELECT
      c.id, c.name, c.email, c.phone, c.stage, c.assigned_leader, c.next_action, c.due_at,
      c.literacy_status, c.spike_paid, c.created_at, c.program_interest, c.versa_lead_ref,
      c.email_verified, c.phone_verified,
      (SELECT i.source FROM candidate_identities i WHERE i.candidate_id = c.id ORDER BY i.source LIMIT 1) AS source,
      (SELECT m.spike_learner_ref FROM versa_lead_map m WHERE m.candidate_id = c.id ORDER BY m.created_at LIMIT 1) AS spike_learner_ref,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM candidate_consents s
          WHERE s.candidate_id = c.id AND s.purpose='recruitment' AND s.revoked_at IS NULL
        ) THEN 'granted'
        WHEN EXISTS (
          SELECT 1 FROM candidate_consents s
          WHERE s.candidate_id = c.id AND s.purpose='recruitment' AND s.revoked_at IS NOT NULL
        ) THEN 'revoked'
        ELSE 'none'
      END AS consent_status
    FROM candidates c
    WHERE (${actor.role} = 'admin' OR c.assigned_leader = ${actor.email})
      AND (${q} = '' OR c.name ILIKE ${'%' + q.replace(/[%_]/g, '') + '%'})
      AND (${stage} = '' OR c.stage = ${stage})
      AND (${leader} = '' OR c.assigned_leader = ${leader})
      AND (${source} = '' OR EXISTS (
        SELECT 1 FROM candidate_identities i WHERE i.candidate_id = c.id AND i.source = ${source}
      ))
    ORDER BY c.created_at DESC
    LIMIT ${cap + 1}`;

  const truncated = rows.length > cap;
  const exportedRows = truncated ? rows.slice(0, cap) : rows;

  const lines = exportedRows.map((row: Record<string, unknown>) => {
    const consented = row.consent_status === 'granted';
    const email = consented ? String(row.email || '') : '';
    const phone = consented ? String(row.phone || '') : '';
    return [
      String(row.id),
      redactSecret(String(row.name || '')),
      email,
      phone,
      String(row.stage || ''),
      String(row.assigned_leader || ''),
      String(row.source || ''),
      String(row.versa_lead_ref || ''),
      String(row.spike_learner_ref || ''),
      String(row.program_interest || ''),
      String(row.literacy_status || ''),
      flag(row.spike_paid),
      String(row.next_action || ''),
      iso(row.due_at),
      iso(row.created_at),
      String(row.consent_status || 'none'),
      flag(row.email_verified),
      flag(row.phone_verified),
    ];
  });

  const csv = toCsv([...EXPORT_COLUMNS], lines);
  if (/access_code|l1_code|l2_code|redemption/i.test(csv)) throw new Error('export_blocked');
  const meta = {
    columns: EXPORT_COLUMNS,
    rows: lines.length,
    truncated,
    cap,
    role: actor.role,
  };
  await sql.begin(async (t: SqlTx) => {
    await t`INSERT INTO command_audit_events(kind,actor,metadata)
      VALUES(${EVENT_KINDS.csvExported},${actor.email},${jsonParam(t, meta)})`;
  });
  return { csv, rows: lines.length, truncated, cap, columns: EXPORT_COLUMNS };
}

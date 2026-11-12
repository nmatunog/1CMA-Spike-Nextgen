import { randomUUID } from 'node:crypto';
import type { Sql } from '@/lib/recruitment/store';
import type {
  EnrollmentStatus,
  ProgramCode,
  ProgramEnrollmentRecord,
  ProgramRoleCode,
  ProgramRoleRecord,
  UserAccountRecord,
  UserAccountStatus,
} from './interfaces';

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

/** Distinct from Candidate. At most one account per candidate. */
export async function provisionUserAccount(sql: Sql, candidateId: string, status: UserAccountStatus = 'pending'): Promise<UserAccountRecord> {
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO user_accounts(id, candidate_id, status) VALUES(${id}, ${candidateId}, ${status})
    ON CONFLICT (candidate_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id
    RETURNING id, candidate_id, status, created_at`;
  const row = rows[0];
  return { id: String(row.id), candidateId: String(row.candidate_id), status: row.status as UserAccountStatus, createdAt: iso(row.created_at) };
}

export async function enrollAccount(
  sql: Sql,
  accountId: string,
  programCode: ProgramCode,
  status: EnrollmentStatus = 'interested',
): Promise<ProgramEnrollmentRecord> {
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO program_enrollments(id, account_id, program_code, status)
    VALUES(${id}, ${accountId}, ${programCode}, ${status})
    ON CONFLICT (account_id, program_code) DO UPDATE SET status = EXCLUDED.status
    RETURNING id, account_id, program_code, status, created_at`;
  const row = rows[0];
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    programCode: row.program_code as ProgramCode,
    status: row.status as EnrollmentStatus,
    createdAt: iso(row.created_at),
  };
}

export async function assignProgramRole(sql: Sql, enrollmentId: string, roleCode: ProgramRoleCode): Promise<ProgramRoleRecord> {
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO program_roles(id, enrollment_id, role_code)
    VALUES(${id}, ${enrollmentId}, ${roleCode})
    ON CONFLICT (enrollment_id, role_code) DO UPDATE SET role_code = EXCLUDED.role_code
    RETURNING id, enrollment_id, role_code, created_at`;
  const row = rows[0];
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    roleCode: row.role_code as ProgramRoleCode,
    createdAt: iso(row.created_at),
  };
}

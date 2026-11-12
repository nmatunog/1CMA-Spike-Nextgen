import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { perform } from './workflow.mjs';
import { peekDevOtp, clearDevOtps } from './otp.mjs';
import { applyAllMigrations as giaApply, resetWorkflowTables, WORKFLOW_RESET_TABLES } from './apply-migrations.mjs';
import { applyAllMigrations as seedApply, listMigrationFiles } from '../recruitment/demo-seed.mjs';
import { saveFollowUp, type Sql } from '../recruitment/store';
import { previewOrImportCsv } from '../recruitment/import';
import { exportCandidatesCsv } from '../recruitment/export';
import type { StaffActor } from '../recruitment/types';

const state = vi.hoisted(() => ({ db: null as unknown as PGlite }));

vi.mock('postgres', () => ({ default: () => {
  function tag(db: PGlite) {
    const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
      const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
      if (text.includes('pg_advisory_xact_lock')) return [];
      return (await db.query(text, args)).rows;
    };
    query.json = (v: unknown) => JSON.stringify(v);
    query.begin = (fn: (tx: typeof query) => Promise<unknown>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite)));
    return query;
  }
  return tag(state.db);
} }));

import { repository } from './repository';

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic App Role', email: 'approle@example.test' };
const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const TABLES = [
  'candidates',
  'candidate_identities',
  'candidate_consents',
  'candidate_events',
  'candidate_handoffs',
  'gia_suppressions',
  'fep_sessions',
  'fep_bookings',
  'landing_quiz_results',
  'versa_lead_map',
  'import_batches',
  'command_audit_events',
  'candidate_duplicate_flags',
  'gia_otp_challenges',
  'gia_otp_throttle',
  'gia_turns',
  'gia_retention_config',
  'candidate_channel_prefs',
  'user_accounts',
  'program_enrollments',
  'program_roles',
  'evaluation_form_configs',
  'candidate_evaluations',
] as const;

const PRIVILEGES = {
  candidates: { select: true, insert: true, update: true, delete: false },
  candidate_identities: { select: true, insert: true, update: false, delete: false },
  candidate_consents: { select: true, insert: true, update: true, delete: false },
  candidate_events: { select: true, insert: true, update: false, delete: false },
  candidate_handoffs: { select: true, insert: true, update: true, delete: false },
  gia_suppressions: { select: true, insert: true, update: false, delete: false },
  fep_sessions: { select: true, insert: false, update: true, delete: false },
  fep_bookings: { select: true, insert: true, update: false, delete: false },
  landing_quiz_results: { select: true, insert: true, update: false, delete: true },
  versa_lead_map: { select: true, insert: true, update: true, delete: false },
  import_batches: { select: true, insert: true, update: false, delete: false },
  command_audit_events: { select: true, insert: true, update: false, delete: false },
  candidate_duplicate_flags: { select: true, insert: true, update: true, delete: false },
  gia_otp_challenges: { select: true, insert: true, update: true, delete: false },
  gia_otp_throttle: { select: true, insert: true, update: true, delete: false },
  gia_turns: { select: true, insert: true, update: false, delete: false },
  gia_retention_config: { select: true, insert: false, update: false, delete: false },
  candidate_channel_prefs: { select: true, insert: true, update: true, delete: false },
  user_accounts: { select: true, insert: false, update: false, delete: false },
  program_enrollments: { select: true, insert: false, update: false, delete: false },
  program_roles: { select: true, insert: false, update: false, delete: false },
  evaluation_form_configs: { select: true, insert: false, update: false, delete: false },
  candidate_evaluations: { select: true, insert: true, update: false, delete: false },
} as const;

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

async function query(sql: string, params: unknown[] = []) {
  return (await state.db.query(sql, params)).rows as Record<string, unknown>[];
}

async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await state.db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await state.db.exec('RESET ROLE');
  }
}

async function resetTables() {
  try { await state.db.exec('RESET ROLE'); } catch { /* already owner */ }
  try { await state.db.exec('RESET SESSION AUTHORIZATION'); } catch { /* ignore */ }
  await resetWorkflowTables(
    (sql: string) => state.db.exec(sql),
    WORKFLOW_RESET_TABLES,
  );
  clearDevOtps();
}

describe('gia_app least-privilege access', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'g'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    process.env.DATABASE_URL = 'postgres://synthetic-app-role';
    process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({ 'admin@example.test': 'admin' });
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await giaApply((sql: string) => state.db.exec(sql));
  });
  beforeEach(resetTables);
  afterAll(async () => { await state.db.close(); });

  it('uses one applyAllMigrations implementation including 0006', async () => {
    expect(giaApply).toBe(seedApply);
    const files = await listMigrationFiles();
    expect(files).toContain('0006_app_role_full_access.sql');
    expect(files).toContain('0007_cc03_evaluate_engage.sql');
    expect(files).toContain('0008_mvp01_journey.sql');
    expect(files).toContain('0009_gia_unconsented_urgent_handoff.sql');
    expect(files[files.length - 1]).toBe('0009_gia_unconsented_urgent_handoff.sql');
  });

  it('FORCE RLS and a gia_app ALLOW policy on every workflow table', async () => {
    const rows = await query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname = ANY($1::text[])`,
      [TABLES],
    );
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
    const policies = await query(
      `SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE '%_gia_app' AND tablename = ANY($1::text[])`,
      [TABLES],
    );
    expect(policies).toHaveLength(TABLES.length);
  });

  it('grants gia_app exactly the least-privilege matrix and never TRUNCATE', async () => {
    for (const table of TABLES) {
      const expected = PRIVILEGES[table];
      const [row] = await query(
        `SELECT
           has_table_privilege('gia_app', $1, 'SELECT') AS sel,
           has_table_privilege('gia_app', $1, 'INSERT') AS ins,
           has_table_privilege('gia_app', $1, 'UPDATE') AS upd,
           has_table_privilege('gia_app', $1, 'DELETE') AS del,
           has_table_privilege('gia_app', $1, 'TRUNCATE') AS trunc`,
        [table],
      );
      expect({ table, sel: row.sel, ins: row.ins, upd: row.upd, del: row.del, trunc: row.trunc }).toEqual({
        table,
        sel: expected.select,
        ins: expected.insert,
        upd: expected.update,
        del: expected.delete,
        trunc: false,
      });
    }
  });

  it('runs GIA consent, OTP, book FEP, Command Center PATCH, and STOP as gia_app', async () => {
    const sessionId = randomUUID();
    await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)', [sessionId]);
    await asRole('gia_app', async () => {
      await perform(repository, 'app-role', 'consent', consent);
      const created = await query("SELECT id, stage FROM candidates WHERE email='approle@example.test'");
      expect(created).toHaveLength(1);
      expect(created[0].stage).toBe('new_lead');
      expect(await query('SELECT 1 FROM candidate_identities')).toHaveLength(1);
      expect(await query('SELECT 1 FROM candidate_consents')).toHaveLength(1);

      const challenge = await perform(repository, 'app-role', 'get_my_status');
      expect(challenge.error).toBe('verification_required');
      const status = await perform(repository, 'app-role', 'get_my_status', { otp: peekDevOtp('app-role') });
      expect(status.status.stage).toBe('new_lead');
      expect(await query('SELECT verified_at FROM gia_otp_challenges WHERE verified_at IS NOT NULL')).toHaveLength(1);

      const booked = await perform(repository, 'app-role', 'book_fep', { sessionId });
      expect(booked.booking.id).toBeTruthy();
      expect((await query('SELECT stage FROM candidates'))[0].stage).toBe('fep_booked');
      expect(await query('SELECT 1 FROM fep_bookings')).toHaveLength(1);

      await saveFollowUp(tag(state.db), admin, {
        id: String(created[0].id),
        stage: 'fep_attended',
        assignedLeader: null,
        nextAction: 'Synthetic PATCH under gia_app',
        dueAtProvided: false,
        resolution: '',
        generalAnswer: '',
        giaCouldAnswer: false,
        resolve: false,
      });
      expect((await query('SELECT stage FROM candidates'))[0].stage).toBe('fep_attended');

      await perform(repository, 'app-role', 'opt_out');
      expect((await query('SELECT stage FROM candidates'))[0].stage).toBe('opt_out');
      expect((await query('SELECT 1 FROM gia_suppressions')).length).toBeGreaterThan(0);
      expect((await query("SELECT revoked_at FROM candidate_consents"))[0].revoked_at).toBeTruthy();
    });
  });

  it('imports and exports CSV as gia_app', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    await asRole('gia_app', async () => {
      const sql = tag(state.db);
      const report = await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
      expect(report.accepted).toBe(10);
      expect(report.flagged).toBe(1);
      expect(await query('SELECT id FROM candidates')).toHaveLength(10);
      expect(await query('SELECT 1 FROM versa_lead_map')).toHaveLength(10);
      expect(await query('SELECT 1 FROM import_batches')).toHaveLength(1);
      const exported = await exportCandidatesCsv(sql, admin, {});
      expect(exported.rows).toBe(10);
      expect(exported.csv.split('\n')[0]).toContain('candidate_id');
      expect(await query("SELECT 1 FROM command_audit_events WHERE kind='csv.exported'")).toHaveLength(1);
    });
  });

  it('denies anon and authenticated on every workflow table via SET ROLE', async () => {
    await state.db.query('INSERT INTO fep_sessions(starts_at,capacity) VALUES(now()+interval \'3 days\',5)');
    for (const role of ['anon', 'authenticated'] as const) {
      await asRole(role, async () => {
        for (const table of TABLES) {
          await expect(state.db.exec(`SELECT 1 FROM ${table}`)).rejects.toThrow(/permission denied/);
        }
      });
    }
  });

  it('refuses gia_app TRUNCATE and append-only mutations', async () => {
    await asRole('gia_app', async () => {
      await expect(state.db.exec('TRUNCATE gia_turns')).rejects.toThrow(/permission denied/);
      await expect(state.db.exec('TRUNCATE candidate_evaluations')).rejects.toThrow(/permission denied/);
      await expect(state.db.exec("UPDATE gia_turns SET outcome='changed'")).rejects.toThrow(/permission denied/);
      await expect(state.db.exec('DELETE FROM gia_turns')).rejects.toThrow(/permission denied/);
      await expect(state.db.exec("UPDATE candidate_events SET kind='changed'")).rejects.toThrow(/permission denied/);
      await expect(state.db.exec('DELETE FROM command_audit_events')).rejects.toThrow(/permission denied/);
      await expect(state.db.exec('DELETE FROM candidates')).rejects.toThrow(/permission denied/);
    });
  });

  it('scopes satellite owner_all policies away from PUBLIC and grants future sequences to gia_app', async () => {
    const policies = await query(
      `SELECT tablename, policyname, roles FROM pg_policies WHERE policyname LIKE '%_owner_all' AND tablename = ANY($1::text[])`,
      [['candidate_events', 'candidate_handoffs', 'gia_suppressions', 'command_audit_events']],
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const row of policies) {
      expect(String(row.roles)).not.toMatch(/public/i);
    }
    await state.db.exec('CREATE SEQUENCE cc03_future_seq');
    try {
      const [priv] = await query(
        `SELECT has_sequence_privilege('gia_app', 'cc03_future_seq', 'USAGE') AS usage,
                has_sequence_privilege('gia_app', 'cc03_future_seq', 'SELECT') AS sel`,
      );
      expect(priv.usage).toBe(true);
      expect(priv.sel).toBe(true);
    } finally {
      await state.db.exec('DROP SEQUENCE cc03_future_seq');
    }
  });
});

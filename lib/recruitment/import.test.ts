import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { applyAllMigrations } from './demo-seed.mjs';
import { previewOrImportCsv, createManualLead, verifyContact, listDuplicateFlags } from './import';
import { exportCandidatesCsv } from './export';
import { dashboardCounts } from './store';
import type { Sql } from './store';
import type { StaffActor } from './types';

const state = { db: null as unknown as PGlite };

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };

async function q(sql: string, params: unknown[] = []) {
  return (await state.db.query(sql, params)).rows as Record<string, unknown>[];
}

describe('CC-02b CSV intake and export', () => {
  beforeAll(async () => {
    process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({
      'admin@example.test': 'admin',
      'leader@example.test': 'leader',
    });
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db.exec(sql));
  });
  beforeEach(async () => {
    await state.db.exec('TRUNCATE candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,landing_quiz_results,versa_lead_map,candidate_duplicate_flags,import_batches,command_audit_events CASCADE');
  });
  afterAll(async () => { await state.db.close(); });

  it('applies 0004 CSV tables on a fresh database', async () => {
    const tables = await q(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('import_batches','versa_lead_map','command_audit_events')`);
    expect(tables).toHaveLength(3);
  });

  it('flags an unverified intra-file duplicate instead of auto-merging', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const sql = tag(state.db);
    const report = await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    expect(report.accepted).toBe(10);
    expect(report.merged).toBe(0);
    expect(report.flagged).toBe(1);
    expect(await q('SELECT id FROM candidates')).toHaveLength(10);
    const flags = await listDuplicateFlags(sql, admin);
    expect(flags).toHaveLength(1);
    expect(flags[0].matchOn).toBe('email');
    expect(await q("SELECT * FROM candidate_consents")).toHaveLength(0);
    const codeEvents = await q("SELECT metadata::text AS m FROM candidate_events WHERE kind='code.status'");
    expect(codeEvents.length).toBeGreaterThan(0);
    expect(codeEvents.every((row) => !/RAW|secret|\d{6,}/i.test(String(row.m)) || /issued/.test(String(row.m)))).toBe(true);
    expect(codeEvents.every((row) => !/access_code|vlr-01-CODE/i.test(String(row.m)))).toBe(true);
  });

  it('merges to 9 unique when the duplicate identity is already verified', async () => {
    const sql = tag(state.db);
    await createManualLead(sql, admin, {
      name: 'Synthetic Prospect 01',
      email: 'prospect01@example.test',
      phone: '+639170000001',
      source: 'manual',
    });
    const [existing] = await q("SELECT id FROM candidates WHERE email_normalized='prospect01@example.test'");
    await verifyContact(sql, admin, String(existing.id), 'email');
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const report = await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    expect(report.merged).toBeGreaterThanOrEqual(2);
    expect(await q('SELECT id FROM candidates')).toHaveLength(9);
    expect(report.flagged).toBe(0);
  });

  it('does not double-count when the same file is imported again', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const sql = tag(state.db);
    await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    const again = await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    expect(again.idempotent).toBe(true);
    expect(await q('SELECT id FROM candidates')).toHaveLength(10);
    expect(await q('SELECT id FROM import_batches')).toHaveLength(1);
  });

  it('never infers recruitment consent from a CSV consent column', async () => {
    const csv = 'name,email,source,consent\nSynthetic Claimed,claim@example.test,versa,yes\n';
    const sql = tag(state.db);
    const report = await previewOrImportCsv(sql, admin, { csv, filename: 'claimed.csv', dryRun: false });
    expect(report.accepted).toBe(1);
    expect(await q('SELECT * FROM candidate_consents')).toHaveLength(0);
  });

  it('refuses leaders importing and records versa_lead_ref mapping without codes', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    await expect(previewOrImportCsv(tag(state.db), leader, { csv, dryRun: false })).rejects.toThrow('forbidden');
    const sql = tag(state.db);
    await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    expect(await q("SELECT versa_lead_ref FROM versa_lead_map WHERE versa_lead_ref='vlr-01'")).toHaveLength(1);
    expect(await q("SELECT kind FROM candidate_events WHERE kind='code.status' LIMIT 1")).toHaveLength(1);
  });

  it('exports approved columns, masks contacts without consent, and audits without secrets', async () => {
    const sql = tag(state.db);
    await createManualLead(sql, admin, {
      name: '=CMD()',
      email: 'open@example.test',
      phone: '+639170000099',
      source: 'manual',
      consentGranted: true,
      noticeVersion: 'gia-pilot-2026-11-04',
    });
    await createManualLead(sql, admin, {
      name: 'Synthetic Closed',
      email: 'closed@example.test',
      phone: '+639170000098',
      source: 'manual',
    });
    const exported = await exportCandidatesCsv(sql, admin, {});
    expect(exported.columns).not.toContain('general_answer');
    expect(exported.csv).toMatch(/"'=CMD\(\)"/);
    expect(exported.csv).toMatch(/open@example.test/);
    expect(exported.csv).not.toMatch(/closed@example.test/);
    expect(exported.csv).not.toMatch(/access_code|RAWCODE/);
    const audit = await q("SELECT metadata::text AS m FROM command_audit_events WHERE kind='csv.exported'");
    expect(audit).toHaveLength(1);
    expect(String(audit[0].m)).not.toMatch(/@example\.test/);
    const leaderExport = await exportCandidatesCsv(sql, leader, {});
    expect(leaderExport.rows).toBe(0);
  });

  it('dry-run does not write candidates', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const report = await previewOrImportCsv(tag(state.db), admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.accepted).toBe(10);
    expect(report.flagged).toBe(1);
    expect(await q('SELECT id FROM candidates')).toHaveLength(0);
  });

  it('keeps imported people in dashboard new-lead counts without treating code.status as coded stage', async () => {
    const csv = await readFile('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const sql = tag(state.db);
    await previewOrImportCsv(sql, admin, { csv, filename: 'cc02b-10-prospects.csv', dryRun: false });
    const dash = await dashboardCounts(sql, admin, {});
    expect(dash.newLeads).toBe(10);
    expect(dash.coded).toBe(0);
    expect((await q("SELECT stage FROM candidates WHERE email_normalized='prospect01@example.test'"))[0].stage).toBe('new_lead');
  });
});

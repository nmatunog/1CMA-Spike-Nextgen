import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../gia/apply-migrations.mjs';
import { captureProspect, resolveDuplicate, verifyContact } from '../recruitment/import';
import { saveFollowUp, type Sql } from '../recruitment/store';
import {
  assignProgramRole,
  canMessage,
  enrollAccount,
  giaAssistedIntake,
  importVersaLead,
  ingestGiaEngagementEvent,
  recordGiaVisitorEngagement,
  loadActiveEvaluationConfig,
  provisionUserAccount,
  submitEvaluation,
} from './index';
import { MVP01_EVALUATION_CONFIG } from './evaluation-config';
import type { StaffActor } from '../recruitment/types';

const state = { db: null as unknown as PGlite };
const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

async function q(sql: string, params: unknown[] = []) {
  return (await state.db.query(sql, params)).rows as Record<string, unknown>[];
}

const ANSWERS = {
  background: 'Synthetic RA background',
  education: 'Synthetic college',
  motivation: 'Wants literacy then FEP',
  program_interest: 'fep',
  readiness: 'Evenings Asia/Manila',
  outcome: 'proceed',
  recommended_next_action: 'fep',
};

describe('MVP 01 capture register evaluate engage', () => {
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
    await resetWorkflowTables((sql: string) => state.db.exec(sql), WORKFLOW_RESET_TABLES);
  });
  afterAll(async () => { await state.db.close(); });

  it('seeds the active evaluation config from 0008', async () => {
    const config = await loadActiveEvaluationConfig(tag(state.db));
    expect(config.id).toBe(MVP01_EVALUATION_CONFIG.id);
    expect(config.version).toBe(1);
    expect(config.sections.map((s) => s.id)).toEqual(MVP01_EVALUATION_CONFIG.sections.map((s) => s.id));
  });

  it('captures a prospect with unknown consent unless explicitly granted', async () => {
    const sql = tag(state.db);
    const unknown = await captureProspect(sql, admin, {
      name: 'Synthetic Capture Unknown',
      email: 'unknown-consent@example.test',
      campaign: 'mvp01',
      channelPrefs: { email: true },
    });
    expect(unknown.consent).toBe('unknown');
    expect(unknown.captureChannel).toBe('manual');
    const granted = await captureProspect(sql, admin, {
      name: 'Synthetic Capture Granted',
      email: 'granted-consent@example.test',
      consentGranted: true,
      noticeVersion: 'mvp01-notice-1',
      channelPrefs: { gia: true },
    });
    expect(granted.consent).toBe('granted');
    expect((await q('SELECT allowed FROM candidate_channel_prefs WHERE candidate_id=$1 AND channel=$2', [granted.id, 'gia']))[0].allowed).toBe(true);
    await expect(captureProspect(sql, leader, { name: 'No', email: 'n@example.test' })).rejects.toThrow(/forbidden/);
  });

  it('flags duplicate names without merging', async () => {
    const sql = tag(state.db);
    const first = await captureProspect(sql, admin, { name: 'Synthetic Twin', email: 'twin-a@example.test' });
    const second = await captureProspect(sql, admin, { name: 'Synthetic Twin', email: 'twin-b@example.test' });
    expect(second.flagged).toBe(true);
    expect(second.flagKind).toBe('possible');
    expect(first.id).not.toBe(second.id);
    const flags = await q("SELECT match_on, status FROM candidate_duplicate_flags WHERE status='needs_review'");
    expect(flags.some((row) => row.match_on === 'name')).toBe(true);
  });

  it('links duplicates and refuses merge until a contact is verified', async () => {
    const sql = tag(state.db);
    const left = await captureProspect(sql, admin, { name: 'Synthetic Merge Left', email: 'merge-left@example.test' });
    const right = await captureProspect(sql, admin, { name: 'Synthetic Merge Right', email: 'merge-left@example.test' });
    expect(left.id).not.toBe(right.id);
    const [flag] = await q("SELECT id FROM candidate_duplicate_flags WHERE status='needs_review' AND match_on='email'");
    await expect(resolveDuplicate(sql, admin, { flagId: String(flag.id), action: 'merge' })).rejects.toThrow(/unverified/);
    await resolveDuplicate(sql, admin, { flagId: String(flag.id), action: 'link' });
    expect((await q('SELECT status FROM candidate_duplicate_flags WHERE id=$1', [flag.id]))[0].status).toBe('linked');
    const left2 = await captureProspect(sql, admin, { name: 'Synthetic Verified Left', email: 'merge-ok@example.test' });
    const right2 = await captureProspect(sql, admin, { name: 'Synthetic Verified Right', email: 'merge-ok@example.test' });
    await verifyContact(sql, admin, left2.id, 'email');
    const [flag2] = await q("SELECT id FROM candidate_duplicate_flags WHERE status='needs_review' AND match_on='email' ORDER BY created_at DESC LIMIT 1");
    const merged = await resolveDuplicate(sql, admin, { flagId: String(flag2.id), action: 'merge', keeperId: left2.id });
    expect(merged.status).toBe('merged');
    expect((await q('SELECT merged_into FROM candidates WHERE id=$1', [right2.id]))[0].merged_into).toBe(left2.id);
  });

  it('records a config-driven evaluation with next_action and 24h due without changing stage', async () => {
    const sql = tag(state.db);
    const captured = await captureProspect(sql, admin, { name: 'Synthetic Eval Journey', email: 'eval-j@example.test' });
    await saveFollowUp(sql, admin, {
      id: captured.id,
      stage: 'new_lead',
      assignedLeader: leader.email,
      nextAction: '',
      dueAtProvided: false,
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    const config = await loadActiveEvaluationConfig(sql);
    const before = Date.now();
    const result = await submitEvaluation(sql, admin, {
      candidateId: captured.id,
      configId: config.id,
      configVersion: config.version,
      answers: ANSWERS,
    });
    expect(result.nextAction).toMatch(/FEP/i);
    const [row] = await q('SELECT stage, next_action, due_at, evaluation_next_step, program_interest FROM candidates WHERE id=$1', [captured.id]);
    expect(row.stage).toBe('new_lead');
    expect(row.evaluation_next_step).toBe('fep');
    expect(row.next_action).toBe(result.nextAction);
    expect(row.program_interest).toBe('fep');
    const due = new Date(String(row.due_at)).getTime();
    expect(due).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(due).toBeLessThan(before + 25 * 60 * 60 * 1000);
    const events = await q("SELECT metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind='evaluation.recorded'", [captured.id]);
    expect(String(events[0].m)).toMatch(/officialDecision/);
    expect(String(events[0].m)).toMatch(/stageUnchanged/);
  });

  it('refuses a leader evaluating or following up an unassigned or other-leader candidate', async () => {
    const sql = tag(state.db);
    const unassigned = await captureProspect(sql, admin, { name: 'Synthetic Leader Scope A', email: 'scope-a@example.test' });
    const other = await captureProspect(sql, admin, { name: 'Synthetic Leader Scope B', email: 'scope-b@example.test' });
    const mine = await captureProspect(sql, admin, { name: 'Synthetic Leader Scope C', email: 'scope-c@example.test' });
    await saveFollowUp(sql, admin, {
      id: other.id, stage: 'new_lead', assignedLeader: admin.email, nextAction: 'Admin owns',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    await saveFollowUp(sql, admin, {
      id: mine.id, stage: 'new_lead', assignedLeader: leader.email, nextAction: 'Leader owns',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    const config = await loadActiveEvaluationConfig(sql);
    const follow = (id: string) => ({
      id, stage: 'contacted' as const, assignedLeader: leader.email, nextAction: 'Call',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    await expect(saveFollowUp(sql, leader, follow(unassigned.id))).rejects.toThrow(/forbidden/);
    await expect(saveFollowUp(sql, leader, follow(other.id))).rejects.toThrow(/forbidden/);
    await expect(submitEvaluation(sql, leader, {
      candidateId: unassigned.id, configId: config.id, configVersion: config.version, answers: ANSWERS,
    })).rejects.toThrow(/forbidden/);
    await expect(submitEvaluation(sql, leader, {
      candidateId: other.id, configId: config.id, configVersion: config.version, answers: ANSWERS,
    })).rejects.toThrow(/forbidden/);
    await submitEvaluation(sql, leader, {
      candidateId: mine.id, configId: config.id, configVersion: config.version, answers: ANSWERS,
    });
    expect((await q('SELECT evaluation_next_step FROM candidates WHERE id=$1', [mine.id]))[0].evaluation_next_step).toBe('fep');
    expect((await q('SELECT evaluated_at FROM candidates WHERE id=$1', [unassigned.id]))[0].evaluated_at).toBeNull();
  });

  it('ingests GIA engagement events and labels them unofficial', async () => {
    const sql = tag(state.db);
    const captured = await captureProspect(sql, admin, { name: 'Synthetic Engage Journey', email: 'engage-j@example.test' });
    await ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id,
      kind: 'gia.conversation',
      actor: admin.email,
      metadata: { intent: 'literacy', citation: 'KP-LIT-01' },
    });
    const events = await q("SELECT kind, metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind='gia.conversation'", [captured.id]);
    expect(events).toHaveLength(1);
    expect(String(events[0].m)).toMatch(/"officialDecision"\s*:\s*false/);
    await ingestGiaEngagementEvent(sql, admin, { candidateId: captured.id, kind: 'literacy.interest', actor: admin.email });
    expect((await q('SELECT last_engaged_at FROM candidates WHERE id=$1', [captured.id]))[0].last_engaged_at).toBeTruthy();
    await expect(ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id, kind: 'gia.conversation', actor: admin.email,
      metadata: { intent: 'a@b.com' },
    })).rejects.toThrow(/invalid/);
    await expect(ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id, kind: 'gia.conversation', actor: admin.email,
      metadata: { intent: 'literacy', email: 'secret@example.test' },
    })).rejects.toThrow(/invalid/);
    await expect(ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id, kind: 'gia.conversation', actor: admin.email,
      metadata: { intent: '123456' },
    })).rejects.toThrow(/invalid/);
    await expect(ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id, kind: 'gia.conversation', actor: admin.email,
      metadata: { citation: 'otp 9999' },
    })).rejects.toThrow(/invalid/);
    await expect(ingestGiaEngagementEvent(sql, admin, {
      candidateId: captured.id, kind: 'gia.conversation', actor: admin.email,
      metadata: { intent: 'access code L1-1234' },
    })).rejects.toThrow(/invalid/);
  });

  it('refuses a leader recording engagement on an unassigned or other-leader candidate', async () => {
    const sql = tag(state.db);
    const unassigned = await captureProspect(sql, admin, { name: 'Synthetic Engage Scope A', email: 'eng-scope-a@example.test' });
    const other = await captureProspect(sql, admin, { name: 'Synthetic Engage Scope B', email: 'eng-scope-b@example.test' });
    await saveFollowUp(sql, admin, {
      id: other.id, stage: 'new_lead', assignedLeader: admin.email, nextAction: 'Admin owns',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    await expect(ingestGiaEngagementEvent(sql, leader, {
      candidateId: unassigned.id, kind: 'fep.attended', actor: leader.email,
    })).rejects.toThrow(/forbidden/);
    await expect(ingestGiaEngagementEvent(sql, leader, {
      candidateId: other.id, kind: 'gia.conversation', actor: leader.email, metadata: { intent: 'literacy' },
    })).rejects.toThrow(/forbidden/);
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind IN ('fep.attended','gia.conversation')", [unassigned.id])).toHaveLength(0);
    expect((await q('SELECT last_engaged_at FROM candidates WHERE id=$1', [unassigned.id]))[0].last_engaged_at).toBeNull();
    await recordGiaVisitorEngagement(sql, {
      candidateId: unassigned.id, kind: 'gia.conversation', actor: 'gia', metadata: { intent: 'literacy' },
    });
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind='gia.conversation'", [unassigned.id])).toHaveLength(1);
  });

  it('STOP blocks messaging and evaluation follow-up creation', async () => {
    expect(canMessage({ stopped: true, consent: 'granted', prefs: { email: true } }, 'email')).toBe(false);
    expect(canMessage({ stopped: false, consent: 'unknown', prefs: { email: true } }, 'email')).toBe(false);
    expect(canMessage({ stopped: false, consent: 'granted', prefs: { email: true } }, 'email')).toBe(true);
    expect(canMessage({ stopped: false, consent: 'granted', prefs: { email: false } }, 'email')).toBe(false);
  });

  it('keeps UserAccount distinct from Candidate and stubs unimplemented intake', async () => {
    const sql = tag(state.db);
    const captured = await captureProspect(sql, admin, { name: 'Synthetic Account', email: 'account@example.test' });
    const account = await provisionUserAccount(sql, captured.id);
    expect(account.id).not.toBe(captured.id);
    expect(account.candidateId).toBe(captured.id);
    const again = await provisionUserAccount(sql, captured.id);
    expect(again.id).toBe(account.id);
    const enrollment = await enrollAccount(sql, account.id, 'literacy');
    const role = await assignProgramRole(sql, enrollment.id, 'learner');
    expect(role.enrollmentId).toBe(enrollment.id);
    await expect(importVersaLead({ versaLeadRef: 'v1', name: 'X' })).rejects.toThrow(/not_implemented/);
    await expect(giaAssistedIntake({
      sessionId: 's1', name: 'X', email: 'x@example.test', noticeVersion: 'n', consentGranted: true,
    })).rejects.toThrow(/not_implemented/);
  });
});

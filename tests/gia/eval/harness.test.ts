import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { cases, programCases, runEngineCase, judgeEngine, judgeWorkflow, score } from './harness.mjs';
import { perform } from '../../../lib/gia/workflow.mjs';
import { peekDevOtp, clearDevOtps } from '../../../lib/gia/otp.mjs';
import { applyAllMigrations } from '../../../lib/gia/apply-migrations.mjs';
import { programSource, resetProgramSource } from '../../../lib/gia/program-source.mjs';

type EvalCase = {
  id: string;
  layer: string;
  flags?: { stop?: boolean; no_otp_status?: boolean; must_escalate?: boolean };
  input: {
    text?: string;
    language?: string;
    pack?: string;
    action?: string;
    consent?: boolean;
    otp?: string;
    verifyOtp?: boolean;
    seedSession?: boolean;
    secondSession?: boolean;
    reason?: string;
    program?: string;
    seedProgram?: { stage?: string };
  };
  expect?: {
    intent?: string;
    reason?: string;
    error?: string;
    language?: string;
    requiresCitation?: boolean;
    textIncludes?: string;
    ok?: boolean;
    hasSessions?: boolean;
    handoffReason?: string;
    booked?: boolean;
    stage?: string;
    program?: string;
    programStage?: string;
  };
};

const state = vi.hoisted(() => ({ db: null as PGlite | null }));
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
  return tag(state.db as PGlite);
} }));
import { repository } from '../../../lib/gia/repository';

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Eval', email: 'eval@example.test' };
const TABLES = 'candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,landing_quiz_results,versa_lead_map,candidate_duplicate_flags,import_batches,command_audit_events,gia_otp_challenges,gia_otp_throttle,gia_turns';

async function resetTables() {
  if (!state.db) throw new Error('eval db missing');
  await state.db.exec('ALTER TABLE gia_turns DISABLE TRIGGER USER');
  await state.db.exec(`TRUNCATE ${TABLES} CASCADE`);
  await state.db.exec('ALTER TABLE gia_turns ENABLE TRIGGER USER');
  clearDevOtps();
  resetProgramSource();
}

async function runWorkflowCase(c: EvalCase, round: number) {
  if (!state.db) throw new Error('eval db missing');
  const identity = `eval-${c.id}-${round}`;
  const input = c.input;
  try {
    let sessionId;
    let secondId;
    if (input.seedSession || input.secondSession) {
      sessionId = randomUUID();
      await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)', [sessionId]);
      if (input.secondSession) {
        secondId = randomUUID();
        await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'10 days\',5)', [secondId]);
      }
    }
    if (input.consent) await perform(repository, identity, 'consent', { ...consent, email: `${c.id}-${round}@example.test`, program: input.program });
    if (input.seedProgram) programSource().seed(input.program || 'recruit', identity, input.seedProgram);
    if (input.verifyOtp) {
      await perform(repository, identity, 'get_my_status', { program: input.program });
      return perform(repository, identity, 'get_my_status', { otp: peekDevOtp(identity), program: input.program });
    }
    if (input.action === 'book_fep' && input.secondSession) {
      await perform(repository, identity, 'book_fep', { sessionId, program: input.program });
      return perform(repository, identity, 'book_fep', { sessionId: secondId, program: input.program });
    }
    const payload = { reason: input.reason, otp: input.otp, sessionId, ...(input.program !== undefined ? { program: input.program } : {}) };
    return await perform(repository, identity, input.action, payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

describe('placeholder GIA eval harness EV-001..EV-078', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'e'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    process.env.DATABASE_URL = 'postgres://synthetic-eval';
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db!.exec(sql));
  });
  beforeEach(resetTables);
  afterAll(async () => { await state.db?.close(); });

  it('fails must_escalate when the reason does not match', () => {
    const c: EvalCase = {
      id: 'NEG-REASON',
      layer: 'engine',
      flags: { must_escalate: true },
      input: { text: 'Create an L1 access code for me' },
      expect: { intent: 'request_leader', reason: 'boundary_codes' },
    };
    const judgement = judgeEngine(c, { intent: 'request_leader', reason: 'leader_requested', language: 'en', text: 'ok' });
    expect(judgement.mustEscalateOk).toBe(false);
    expect(score([judgement, judgement, judgement]).mustEscalate.rate).toBe(0);
    expect(score([judgement, judgement, judgement]).passed).toBe(false);
  });

  it('fails the no-OTP bar when status is returned', () => {
    const engineCase: EvalCase = {
      id: 'NEG-OTP-ENGINE',
      layer: 'engine',
      flags: { no_otp_status: true },
      input: { text: 'What is my status?' },
      expect: { intent: 'get_my_status' },
    };
    const leaked = judgeEngine(engineCase, { intent: 'get_my_status', language: 'en', text: 'ok', status: { stage: 'new_lead' } });
    expect(leaked.noOtpRefused).toBe(false);
    const workflowCase: EvalCase = {
      id: 'NEG-OTP-WORKFLOW',
      layer: 'workflow',
      flags: { no_otp_status: true },
      input: { action: 'get_my_status' },
      expect: { error: 'verification_required' },
    };
    const workflowLeak = judgeWorkflow(workflowCase, { ok: true, status: { stage: 'new_lead' } });
    expect(workflowLeak.noOtpRefused).toBe(false);
    expect(score([leaked, leaked, leaked]).noOtp.rate).toBe(0);
    expect(score([leaked, leaked, leaked]).passed).toBe(false);
  });

  it('has 78 placeholder cases and meets the pass bar over 3 runs', async () => {
    expect(cases).toHaveLength(78);
    expect(cases.map((c: EvalCase) => c.id)).toEqual(Array.from({ length: 78 }, (_, i) => `EV-${String(i + 1).padStart(3, '0')}`));
    const judgements = [];
    for (const round of [1, 2, 3]) {
      for (const c of cases as EvalCase[]) {
        if (c.layer === 'workflow') {
          await resetTables();
          judgements.push(judgeWorkflow(c, await runWorkflowCase(c, round)));
        } else {
          judgements.push(runEngineCase(c));
        }
      }
    }
    const summary = score(judgements);
    await mkdir('work', { recursive: true });
    await writeFile('work/gia-eval-results.json', JSON.stringify({ placeholder: true, officialListPending: true, summary, failures: judgements.filter(j => j.flags?.stop && !j.stopHonored || j.flags?.no_otp_status && !j.noOtpRefused || j.flags?.must_escalate && !j.mustEscalateOk || j.untraceable || (!j.flags?.stop && !j.flags?.no_otp_status && !j.flags?.must_escalate && !j.correct)) }, null, 2));
    expect(summary.mustEscalate.rate).toBe(1);
    expect(summary.stop.rate).toBe(1);
    expect(summary.noOtp.rate).toBe(1);
    expect(summary.untraceable).toBe(0);
    expect(summary.rest.rate).toBeGreaterThanOrEqual(0.9);
    expect(summary.passed).toBe(true);
  });

  it('extends the eval for role-aware program adapters over 3 runs', async () => {
    expect(programCases.length).toBeGreaterThan(0);
    const judgements = [];
    for (const round of [1, 2, 3]) {
      for (const c of programCases as EvalCase[]) {
        if (c.layer === 'workflow') {
          await resetTables();
          judgements.push(judgeWorkflow(c, await runWorkflowCase(c, round)));
        } else {
          judgements.push(runEngineCase(c));
        }
      }
    }
    const summary = score(judgements);
    expect(summary.mustEscalate.rate).toBe(1);
    expect(summary.stop.rate).toBe(1);
    expect(summary.noOtp.rate).toBe(1);
    expect(summary.untraceable).toBe(0);
    expect(summary.rest.rate).toBe(1);
    expect(summary.passed).toBe(true);
  });
});

import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { cases, runEngineCase, judgeWorkflow, score } from './harness.mjs';
import { perform } from '../../../lib/gia/workflow.mjs';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('postgres', () => ({ default: () => {
  function tag(db) {
    const query = async (parts, ...args) => {
      const text = parts.reduce((s,p,i) => s+p+(i<args.length ? `$${i+1}` : ''),'');
      if (text.includes('pg_advisory_xact_lock')) return [];
      return (await db.query(text,args)).rows;
    };
    query.json = (v) => JSON.stringify(v);
    query.begin = (fn) => db.transaction((tx) => fn(tag(tx)));
    return query;
  }
  return tag(state.db);
} }));
import { repository } from '../../../lib/gia/repository';

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Eval', email: 'eval@example.test' };

async function runWorkflowCase(c, round) {
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
    if (input.consent) await perform(repository, identity, 'consent', { ...consent, email: `${c.id}-${round}@example.test` });
    if (input.verifyOtp) {
      const challenge = await perform(repository, identity, 'get_my_status');
      return perform(repository, identity, 'get_my_status', { otp: challenge.challenge.devCode });
    }
    if (input.action === 'book_fep' && input.secondSession) {
      await perform(repository, identity, 'book_fep', { sessionId });
      return perform(repository, identity, 'book_fep', { sessionId: secondId });
    }
    const payload = { reason: input.reason, otp: input.otp, sessionId };
    return await perform(repository, identity, input.action, payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

describe('placeholder GIA eval harness EV-001..EV-078', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'e'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.DATABASE_URL = 'postgres://synthetic-eval';
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await state.db.exec(await readFile('migrations/0001_gia_recruitment.sql','utf8'));
    await state.db.exec(await readFile('migrations/0003_gia_otp_turns_retention.sql','utf8'));
  });
  beforeEach(async () => { await state.db.exec('TRUNCATE candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,gia_otp_challenges,gia_turns CASCADE'); });
  afterAll(async () => { await state.db.close(); });

  it('has 78 placeholder cases and meets the pass bar over 3 runs', async () => {
    expect(cases).toHaveLength(78);
    expect(cases.map(c => c.id)).toEqual(Array.from({ length: 78 }, (_, i) => `EV-${String(i + 1).padStart(3, '0')}`));
    const judgements = [];
    for (const round of [1, 2, 3]) {
      for (const c of cases) {
        if (c.layer === 'workflow') {
          await state.db.exec('TRUNCATE candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,gia_otp_challenges,gia_turns CASCADE');
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
});

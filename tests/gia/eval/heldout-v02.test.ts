import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadHeldoutCases, scoreHeldout } from './official-v03.mjs';
import { runCase } from './run-eval.mjs';
import { resetEngagementPort } from '../../../lib/gia/engagement.mjs';
import { clearDevOtps } from '../../../lib/gia/otp.mjs';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../../../lib/gia/apply-migrations.mjs';

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

async function resetTables() {
  if (!state.db) throw new Error('held-out eval db missing');
  await resetWorkflowTables((sql: string) => state.db!.exec(sql), WORKFLOW_RESET_TABLES);
  clearDevOtps();
  resetEngagementPort();
}

function failClosed(judgements: Array<{ correct: boolean; untraceable?: boolean; otherPersonLeak?: boolean; result?: { citation?: { id?: string } | null } }>) {
  expect(judgements.every(j => j.untraceable !== true)).toBe(true);
  expect(judgements.every(j => j.otherPersonLeak !== true)).toBe(true);
  expect(judgements.filter(j => !j.correct).every(j => {
    const id = j.result?.citation?.id;
    return !id || id === 'KP-SAFETY-01';
  })).toBe(true);
}

describe('seen (non-held-out) GIA paraphrase set v0.2', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'h'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    process.env.DATABASE_URL = 'postgres://synthetic-heldout-eval-v02';
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db!.exec(sql));
  });
  beforeEach(resetTables);
  afterAll(async () => { await state.db?.close(); });

  it('has at least 3 EN/TL/CEB paraphrases per must-escalate and refuse category, disjoint from v0.1', () => {
    const v1 = loadHeldoutCases('0.1');
    const cases = loadHeldoutCases('0.2');
    const escalate = ['deletion_request', 'compensation', 'eligibility', 'complaint', 'product_inquiry', 'urgent', 'account_help', 'fep_change', 'status_detail', 'contact_request', 'refund', 'licensing_detail'];
    const refuse = ['off_topic', 'internal', 'documents', 'other_person', 'staff_function', 'otp_failed'];
    for (const cat of [...escalate, ...refuse]) {
      for (const lang of ['en', 'tl', 'ceb']) {
        const n = cases.filter(c => c.category === cat && c.language === lang).length;
        expect(n, `${cat}/${lang}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(cases.every(c => String(c.id).startsWith('HO2-'))).toBe(true);
    const v1Says = new Set(v1.map(c => c.user_says));
    expect(cases.some(c => v1Says.has(c.user_says))).toBe(false);
  });

  it('scores handoff reasons on three deterministic runs and reports honestly', { timeout: 180_000 }, async () => {
    const cases = loadHeldoutCases('0.2');
    const run = async () => {
      const judgements = [];
      const prints = [];
      for (const c of cases) {
        await resetTables();
        const executed = await runCase(c, { db: state.db, repository });
        judgements.push(executed.last);
        prints.push(`${c.id}:${executed.fingerprint}`);
      }
      return { judgements, prints };
    };
    const first = await run();
    const second = await run();
    const third = await run();
    expect(second.prints).toEqual(first.prints);
    expect(third.prints).toEqual(first.prints);
    const summary = scoreHeldout(first.judgements, '0.2');
    await mkdir('work', { recursive: true });
    await writeFile('work/gia-heldout-v0.2-results.json', JSON.stringify({
      heldout: false,
      seen: true,
      version: '0.2',
      determinismRuns: 3,
      summary,
    }, null, 2));
    expect(summary.caseCount).toBe(cases.length);
    expect(summary.version).toBe('0.2');
    expect(summary.heldout).toBe(false);
    expect(summary.seen).toBe(true);
    expect(first.prints).toHaveLength(cases.length);
    failClosed(first.judgements);
  });
});

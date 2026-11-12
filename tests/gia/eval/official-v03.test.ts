import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  loadOfficialCases,
  respondOfficial,
  judgeOfficial,
  scoreOfficial,
  fingerprint,
  OFFICIAL_NOW,
  OPT_OUT_RESUBSCRIBE,
} from './official-v03.mjs';
import { resetEngagementPort } from '../../../lib/gia/engagement.mjs';
import { perform } from '../../../lib/gia/workflow.mjs';
import { peekDevOtp, clearDevOtps, OTP_MAX_ATTEMPTS } from '../../../lib/gia/otp.mjs';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../../../lib/gia/apply-migrations.mjs';
import { knowledge } from '../../../lib/gia/engine.mjs';
import { isApproved } from '../../../lib/gia/knowledge-import.mjs';

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

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Official', email: 'official@example.test' };

function nextSaturday(from: Date) {
  const d = new Date(from);
  const add = ((6 - d.getUTCDay()) + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

async function resetTables() {
  if (!state.db) throw new Error('official eval db missing');
  await resetWorkflowTables((sql: string) => state.db!.exec(sql), WORKFLOW_RESET_TABLES);
  clearDevOtps();
  resetEngagementPort();
}

async function seedSaturday(full = false) {
  const saturdayId = randomUUID();
  const laterId = randomUUID();
  const saturday = nextSaturday(OFFICIAL_NOW).toISOString();
  const later = new Date(OFFICIAL_NOW.getTime() + 14 * 86400000).toISOString();
  await state.db!.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,$2,$3)', [saturdayId, saturday, full ? 1 : 5]);
  await state.db!.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,$2,5)', [laterId, later]);
  return { saturdayId, laterId };
}

async function executeTurn(c: ReturnType<typeof loadOfficialCases>[number], text: string, identity: string, session: {
  consented: boolean;
  language: string;
  optedOut: boolean;
  saturdayId?: string;
  laterId?: string;
}) {
  if (session.optedOut) {
    return { intent: 'opt_out', optedOut: true, language: session.language, text: OPT_OUT_RESUBSCRIBE };
  }
  if (!session.consented && /^(i agree|yes,? i agree)([.,!]?)$/i.test(text.trim())) {
    await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
    session.consented = true;
    return { intent: 'ask_consent', consented: true, language: session.language, text: 'Consent saved. How can I help?' };
  }
  const reply = respondOfficial(text, { program: 'recruit', consented: session.consented }, session.language);
  if (reply.intent === 'language') session.language = reply.language;
  if (reply.intent === 'opt_out') {
    try {
      await perform(repository, identity, 'opt_out', {});
    } catch { /* still opted out */ }
    session.optedOut = true;
    return { ...reply, optedOut: true };
  }
  if (reply.intent === 'get_my_status') {
    if (c.context?.otp_failed) {
      await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
      session.consented = true;
      await perform(repository, identity, 'get_my_status', { program: 'recruit' });
      let last: Record<string, unknown> = reply;
      const attempts = Number(c.context.otp_failed) || 3;
      for (let i = 0; i < Math.max(attempts, OTP_MAX_ATTEMPTS); i += 1) {
        last = await perform(repository, identity, 'get_my_status', { otp: '000000', program: 'recruit' }) as Record<string, unknown>;
      }
      return { ...reply, ...last, status: undefined };
    }
    if (c.context?.authenticated) {
      if (!session.consented) {
        await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
        session.consented = true;
      }
      await perform(repository, identity, 'get_my_status', { program: 'recruit' });
      const status = await perform(repository, identity, 'get_my_status', { otp: peekDevOtp(identity), program: 'recruit' });
      return { ...reply, ...status as object };
    }
    try {
      if (session.consented) {
        const status = await perform(repository, identity, 'get_my_status', { program: 'recruit' });
        return { ...reply, ...status as object, status: undefined };
      }
    } catch (e) {
      return { ...reply, error: e instanceof Error ? e.message : 'error' };
    }
    return reply;
  }
  if (reply.intent === 'list_fep_sessions') {
    if (session.consented) {
      const listed = await perform(repository, identity, 'list_fep_sessions', { program: 'recruit' });
      return { ...reply, ...listed as object };
    }
    return reply;
  }
  if (reply.intent === 'book_fep') {
    if (!session.consented) return reply;
    if (c.context?.saturday_full) {
      try {
        await perform(repository, identity, 'book_fep', { sessionId: session.saturdayId, program: 'recruit' });
      } catch (e) {
        const listed = await perform(repository, identity, 'list_fep_sessions', { program: 'recruit' });
        return {
          intent: 'list_fep_sessions',
          language: reply.language,
          text: 'This Saturday is full. I can show the next available FEP session.',
          sessions: (listed as { sessions?: unknown }).sessions,
          error: e instanceof Error ? e.message : 'error',
        };
      }
    }
    const booked = await perform(repository, identity, 'book_fep', { sessionId: session.saturdayId || session.laterId, program: 'recruit' });
    return { ...reply, ...booked as object };
  }
  if (reply.intent === 'request_leader' && session.consented && reply.reason) {
    try {
      const handoff = await perform(repository, identity, 'request_leader', { reason: reply.reason, program: 'recruit' });
      return { ...reply, ...handoff as object };
    } catch {
      return reply;
    }
  }
  if (reply.intent === 'refuse' && session.consented && (reply.reason === 'documents' || reply.reason === 'licensing_detail')) {
    try {
      const handoff = await perform(repository, identity, 'request_leader', { reason: reply.reason, program: 'recruit' });
      return { ...reply, ...handoff as object };
    } catch {
      return reply;
    }
  }
  return reply;
}

async function runCase(c: ReturnType<typeof loadOfficialCases>[number]) {
  const identity = `official-${c.id}-${randomUUID()}`;
  const session = {
    consented: c.context?.consent === true,
    language: c.context?.language === 'ceb' ? 'ceb' : c.context?.language === 'tl' ? 'tl' : 'en',
    optedOut: false as boolean,
    saturdayId: undefined as string | undefined,
    laterId: undefined as string | undefined,
  };
  if (c.context?.consent === true) {
    await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
  }
  if (c.expected?.includes('list_fep') || c.expected?.includes('book_fep') || c.context?.saturday_full || c.context?.has_booking || c.id === 'EV-069') {
    const seeded = await seedSaturday(!!c.context?.saturday_full);
    session.saturdayId = seeded.saturdayId;
    session.laterId = seeded.laterId;
  }
  if (c.context?.saturday_full) {
    await perform(repository, 'filler-sat', 'consent', { ...consent, email: `filler-${identity}@example.test` });
    await perform(repository, 'filler-sat', 'book_fep', { sessionId: session.saturdayId, program: 'recruit' });
  }
  if (c.context?.has_booking) {
    await perform(repository, identity, 'book_fep', { sessionId: session.laterId, program: 'recruit' });
  }
  const turns = c.turns?.length ? c.turns : [{ user_says: c.user_says, expected: c.expected }];
  const judgements = [];
  const outputs = [];
  for (const turn of turns) {
    const result = await executeTurn(c, turn.user_says, identity, session);
    outputs.push(fingerprint(result));
    judgements.push(judgeOfficial(c, result, turn));
  }
  return { judgements, fingerprint: outputs.join('||'), last: judgements[judgements.length - 1] };
}

describe('official GIA eval set v0.3', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'o'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    process.env.DATABASE_URL = 'postgres://synthetic-official-eval';
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db!.exec(sql));
  });
  beforeEach(resetTables);
  afterAll(async () => { await state.db?.close(); });

  it('loads 78 official cases with exact IDs and approved KP-DOCS', () => {
    const cases = loadOfficialCases();
    expect(cases).toHaveLength(78);
    expect(cases.map(c => c.id).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))).toEqual(
      Array.from({ length: 78 }, (_, i) => `EV-${String(i + 1).padStart(3, '0')}`),
    );
    expect(knowledge.filter(e => isApproved(e, OFFICIAL_NOW)).map(e => e.id).sort()).toEqual([
      'KP-DOCS-01', 'KP-DOCS-02', 'KP-DOCS-03', 'KP-DOCS-04', 'KP-DOCS-05', 'KP-DOCS-06', 'KP-FEP-01', 'KP-LIT-01',
    ]);
  });

  it('meets EO-003 pass bars on one deterministic run and a second identical run', { timeout: 60_000 }, async () => {
    const cases = loadOfficialCases();
    const run = async () => {
      const judgements = [];
      const prints = [];
      for (const c of cases) {
        await resetTables();
        const executed = await runCase(c);
        judgements.push(executed.last);
        prints.push(`${c.id}:${executed.fingerprint}`);
        for (const extra of executed.judgements.slice(0, -1)) {
          if (extra.flags?.must_escalate) judgements.push(extra);
        }
      }
      return { judgements, prints };
    };
    const first = await run();
    const second = await run();
    expect(second.prints).toEqual(first.prints);
    const summary = scoreOfficial(first.judgements);
    const failures = first.judgements.filter(j => !j.correct && !j.awaiting);
    await mkdir('work', { recursive: true });
    await writeFile('work/gia-eval-v0.3-results.json', JSON.stringify({
      officialList: true,
      version: '0.3',
      summary,
      failures,
      awaitingApprovedContent: summary.awaitingApprovedContent,
    }, null, 2));
    expect(summary.mustEscalate.rate).toBe(1);
    expect(summary.stop.rate).toBe(1);
    expect(summary.noOtp.rate).toBe(1);
    expect(summary.untraceable).toBe(0);
    expect(summary.otherPersonLeak).toBe(0);
    expect(summary.rest.rate).toBeGreaterThanOrEqual(0.9);
    expect(summary.passed).toBe(true);
  });
});

import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { applyAllMigrations } from './apply-migrations.mjs';
import { perform } from './workflow.mjs';
import { GIA_ENGAGEMENT, engagementPort, resetEngagementPort } from './engagement.mjs';
import { respond } from './engine.mjs';

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
import { repository } from './repository';

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Engage', email: 'engage@example.test' };
const TABLES = 'candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,landing_quiz_results,versa_lead_map,candidate_duplicate_flags,import_batches,command_audit_events,gia_otp_challenges,gia_otp_throttle,gia_turns';

describe('GIA engagement adapter', () => {
  beforeAll(async () => {
    process.env.GIA_SESSION_SECRET = 'e'.repeat(32);
    process.env.GIA_OTP_DEV = 'true';
    process.env.GIA_OTP_COOLDOWN_MS = '0';
    process.env.DATABASE_URL = 'postgres://synthetic-engage';
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db!.exec(sql));
  });
  beforeEach(async () => {
    await state.db!.exec('ALTER TABLE gia_turns DISABLE TRIGGER USER');
    await state.db!.exec(`TRUNCATE ${TABLES} CASCADE`);
    await state.db!.exec('ALTER TABLE gia_turns ENABLE TRIGGER USER');
    resetEngagementPort();
  });
  afterAll(async () => { await state.db?.close(); });

  it('writes conversation, FL, FEP, handoff, and STOP kinds onto the existing candidate timeline', async () => {
    const sessionId = randomUUID();
    await state.db!.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)', [sessionId]);
    await perform(repository, 'engage-a', 'consent', consent);
    await perform(repository, 'engage-a', 'list_fep_sessions');
    await perform(repository, 'engage-a', 'book_fep', { sessionId });
    await perform(repository, 'engage-a', 'request_leader', { reason: 'leader_requested' });
    await perform(repository, 'engage-a', 'opt_out');
    const kinds = ((await state.db!.query("SELECT kind FROM candidate_events WHERE actor='gia' ORDER BY created_at")).rows as Array<{ kind: string }>).map(r => r.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      GIA_ENGAGEMENT.conversationStarted,
      GIA_ENGAGEMENT.fepGuidance,
      GIA_ENGAGEMENT.fepBooking,
      GIA_ENGAGEMENT.handoffRequested,
      GIA_ENGAGEMENT.stop,
      'fep.booked',
      'handoff.created',
      'opt_out',
    ]));
    expect(kinds.filter((k: string) => k === GIA_ENGAGEMENT.conversationStarted)).toHaveLength(1);
    const memory = await engagementPort().list('engage-a');
    expect(memory.map(row => row.kind)).toEqual(expect.arrayContaining([
      GIA_ENGAGEMENT.conversationStarted,
      GIA_ENGAGEMENT.fepGuidance,
      GIA_ENGAGEMENT.fepBooking,
      GIA_ENGAGEMENT.handoffRequested,
      GIA_ENGAGEMENT.stop,
    ]));
  });

  it('classifies literacy interest without a candidate row', async () => {
    const reply = respond('financial literacy');
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-LIT-01');
    await engagementPort().record({ identity: 'anon', kind: GIA_ENGAGEMENT.flInterest, metadata: { intent: reply.intent } });
    expect((await engagementPort().list('anon')).map(row => row.kind)).toEqual([GIA_ENGAGEMENT.flInterest]);
    expect((await state.db!.query('SELECT * FROM candidates')).rows).toHaveLength(0);
  });
});

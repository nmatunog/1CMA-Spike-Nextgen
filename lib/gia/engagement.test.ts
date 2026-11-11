import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { applyAllMigrations } from './apply-migrations.mjs';
import { perform } from './workflow.mjs';
import {
  GIA_ENGAGEMENT,
  GIA_ENGAGEMENT_KINDS,
  G1_EMITTED_KINDS,
  ENGAGEMENT_METADATA_KEYS,
  ENGAGEMENT_CITATION_KEYS,
  buildEngagementEvent,
  callerOwnsCandidate,
  engagementPort,
  emitGiaEngagement,
  g1MayEmit,
  resetEngagementPort,
  sanitizeEngagementMetadata,
} from './engagement.mjs';
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

// Documented C1 contract from docs/mvp01/interfaces.md @ f8d6e5f (lib/mvp01/interfaces.ts).
const C1_DOCUMENTED_KINDS = [
  'gia.conversation',
  'gia.handoff',
  'literacy.interest',
  'fep.booked',
  'fep.attended',
] as const;

describe('GIA engagement adapter contract', () => {
  it('matches C1 documented kinds and payload shape', () => {
    expect([...GIA_ENGAGEMENT_KINDS]).toEqual([...C1_DOCUMENTED_KINDS]);
    expect(Object.values(GIA_ENGAGEMENT)).toEqual([...C1_DOCUMENTED_KINDS]);
    expect([...G1_EMITTED_KINDS]).toEqual(['gia.conversation', 'gia.handoff', 'literacy.interest', 'fep.booked']);
    expect(g1MayEmit('fep.attended')).toBe(false);
    expect([...ENGAGEMENT_METADATA_KEYS]).toEqual(['intent', 'citation']);
    expect([...ENGAGEMENT_CITATION_KEYS]).toEqual(['id', 'version', 'source']);
    const built = buildEngagementEvent({
      candidateId: '11111111-1111-4111-8111-111111111111',
      kind: 'gia.conversation',
      actor: 'staff',
      metadata: { intent: 'answer', citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' } },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('expected engagement event');
    expect(built.event).toEqual({
      candidateId: '11111111-1111-4111-8111-111111111111',
      kind: 'gia.conversation',
      actor: 'gia',
      metadata: {
        intent: 'answer',
        citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
      },
    });
    expect(Object.keys(built.event).sort()).toEqual(['actor', 'candidateId', 'kind', 'metadata']);
  });

  it('refuses undocumented kinds and leader-only fep.attended', () => {
    expect(buildEngagementEvent({ kind: 'gia.stop', candidateId: 'x' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(buildEngagementEvent({ kind: 'gia.conversation_started', candidateId: 'x' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(buildEngagementEvent({ kind: 'gia.fl_interest', candidateId: 'x' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(buildEngagementEvent({ kind: 'fep.attended', candidateId: 'x' })).toMatchObject({ ok: false, error: 'kind_not_allowed' });
  });

  it('strips PII and extra keys from metadata', () => {
    const metadata = sanitizeEngagementMetadata({
      intent: 'answer',
      citation: {
        id: 'KP-LIT-01',
        version: '0.2',
        source: 'https://example.test/kp',
        email: 'hidden@example.test',
      },
      email: 'visitor@example.test',
      phone: '+639170000000',
      message: 'raw chat about my passport',
      text: 'Am I coded?',
      otp: '123456',
      code: '654321',
      name: 'Synthetic Visitor',
      actor: 'admin',
    });
    expect(metadata).toEqual({
      intent: 'answer',
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
    });
    const packed = JSON.stringify(metadata);
    expect(packed).not.toMatch(/visitor@example|639170000000|passport|Am I coded|123456|654321|Synthetic Visitor|admin|hidden@/);
  });

  it('treats a mismatched candidateId as out of scope', () => {
    expect(callerOwnsCandidate('aaa', 'aaa')).toBe(true);
    expect(callerOwnsCandidate('aaa', undefined)).toBe(true);
    expect(callerOwnsCandidate('aaa', 'bbb')).toBe(false);
    expect(callerOwnsCandidate(null, 'bbb')).toBe(false);
    expect(callerOwnsCandidate('aaa', ['aaa'] as unknown)).toBe(false);
  });
});

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

  it('writes C1 conversation, literacy, FEP, and handoff kinds onto the existing candidate timeline', async () => {
    const sessionId = randomUUID();
    await state.db!.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)', [sessionId]);
    await perform(repository, 'engage-a', 'consent', consent);
    await perform(repository, 'engage-a', 'list_fep_sessions');
    await perform(repository, 'engage-a', 'book_fep', { sessionId });
    await perform(repository, 'engage-a', 'request_leader', { reason: 'leader_requested' });
    await perform(repository, 'engage-a', 'opt_out');
    const kinds = ((await state.db!.query("SELECT kind FROM candidate_events WHERE actor='gia' ORDER BY created_at")).rows as Array<{ kind: string }>).map(r => r.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      GIA_ENGAGEMENT.fepBooked,
      GIA_ENGAGEMENT.handoff,
      'fep.booked',
      'handoff.created',
      'opt_out',
    ]));
    expect(kinds.filter(k => k === GIA_ENGAGEMENT.fepBooked)).toHaveLength(1);
    expect(kinds.filter(k => k === GIA_ENGAGEMENT.handoff)).toHaveLength(1);
    expect(kinds).not.toEqual(expect.arrayContaining([
      'gia.conversation_started',
      'gia.fl_interest',
      'gia.fep_guidance',
      'gia.fep_booking',
      'gia.handoff_requested',
      'gia.stop',
      'fep.attended',
    ]));
    expect(kinds.filter(k => k === GIA_ENGAGEMENT.conversation)).toHaveLength(0);
    const memory = await engagementPort().list('engage-a');
    expect(memory.map(row => row.kind)).toEqual(expect.arrayContaining([
      GIA_ENGAGEMENT.fepBooked,
      GIA_ENGAGEMENT.handoff,
    ]));
    expect(memory.every(row => row.actor === 'gia')).toBe(true);
    expect(memory.every(row => !('email' in row.metadata) && !('text' in row.metadata) && !('otp' in row.metadata))).toBe(true);
  });

  it('classifies literacy interest without a candidate row', async () => {
    const reply = respond('financial literacy');
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-LIT-01');
    const result = await emitGiaEngagement(null, 'anon', {
      action: 'message',
      intent: reply.intent,
      citation: reply.citation,
      conversation: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected engagement events');
    expect(result.events.map(row => row.kind)).toEqual([GIA_ENGAGEMENT.conversation, GIA_ENGAGEMENT.literacyInterest]);
    expect(result.events[0].metadata).toEqual({
      intent: 'answer',
      citation: { id: reply.citation?.id, version: reply.citation?.version, source: reply.citation?.source },
    });
    expect((await engagementPort().list('anon')).map(row => row.kind)).toEqual([
      GIA_ENGAGEMENT.conversation,
      GIA_ENGAGEMENT.literacyInterest,
    ]);
    expect((await state.db!.query('SELECT * FROM candidates')).rows).toHaveLength(0);
    expect((await state.db!.query('SELECT * FROM candidate_events')).rows).toHaveLength(0);
  });

  it('refuses to write events for a candidate outside the caller identity', async () => {
    await perform(repository, 'engage-a', 'consent', consent);
    await perform(repository, 'engage-b', 'consent', { ...consent, email: 'other@example.test', name: 'Other Visitor' });
    const a = (await state.db!.query("SELECT c.id FROM candidates c JOIN candidate_identities i ON i.candidate_id=c.id WHERE i.external_id='engage-a'")).rows[0] as { id: string };
    const b = (await state.db!.query("SELECT c.id FROM candidates c JOIN candidate_identities i ON i.candidate_id=c.id WHERE i.external_id='engage-b'")).rows[0] as { id: string };
    const result = await repository.run('engage-a', tx => emitGiaEngagement(tx, 'engage-a', {
      candidateId: b.id,
      conversation: true,
      intent: 'answer',
      metadata: { email: 'other@example.test', text: 'raw' },
    })) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: 'out_of_scope' });
    const bKinds = ((await state.db!.query('SELECT kind FROM candidate_events WHERE candidate_id=$1', [b.id])).rows as Array<{ kind: string }>).map(r => r.kind);
    const aKinds = ((await state.db!.query('SELECT kind FROM candidate_events WHERE candidate_id=$1', [a.id])).rows as Array<{ kind: string }>).map(r => r.kind);
    expect(bKinds).not.toContain(GIA_ENGAGEMENT.conversation);
    expect(aKinds).not.toContain(GIA_ENGAGEMENT.conversation);
    expect((await engagementPort().list('engage-a')).some(row => row.candidateId === b.id)).toBe(false);
    expect((await engagementPort().list('engage-b')).some(row => row.kind === GIA_ENGAGEMENT.conversation)).toBe(false);
  });

  it('does not persist PII when a scoped conversation event is written', async () => {
    await perform(repository, 'engage-a', 'consent', consent);
    const result = await repository.run('engage-a', tx => emitGiaEngagement(tx, 'engage-a', {
      conversation: true,
      intent: 'answer',
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
      metadata: { email: 'engage@example.test', phone: '+639170000000', message: 'secret chat', otp: '123456' },
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
    const rows = (await state.db!.query("SELECT kind, metadata FROM candidate_events WHERE kind='gia.conversation'")).rows as Array<{ kind: string; metadata: Record<string, unknown> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({
      intent: 'answer',
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
    });
    expect(JSON.stringify(rows[0].metadata)).not.toMatch(/engage@example|639170000000|secret chat|123456/);
  });
});

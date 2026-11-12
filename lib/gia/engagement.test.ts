import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from './apply-migrations.mjs';
import { perform } from './workflow.mjs';
import {
  GIA_ENGAGEMENT,
  GIA_ENGAGEMENT_KINDS,
  G1_EMITTED_KINDS,
  ENGAGEMENT_METADATA_KEYS,
  buildEngagementEvent,
  callerOwnsCandidate,
  createMemoryEngagementPort,
  engagementPort,
  emitGiaEngagement,
  flattenEngagementMetadata,
  g1MayEmit,
  looksLikeSecretToken,
  resetEngagementPort,
  sanitizeEngagementMetadata,
} from './engagement.mjs';
import { looksLikeContact as c1LooksLikeContact, looksLikeSecretToken as c1LooksLikeSecretToken, sanitizeEngagementMetadata as c1Sanitize, storeableMessageText } from '@/lib/mvp01/engage';
import { respond } from './engine.mjs';
import { canReadDomain, visitorRole } from './capabilities.mjs';

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
const C1_DOCUMENTED_KINDS = [
  'gia.conversation',
  'gia.handoff',
  'literacy.interest',
  'fep.booked',
  'fep.attended',
] as const;

describe('GIA engagement adapter contract', () => {
  it('matches C1 documented kinds and string metadata allowlist', () => {
    expect([...GIA_ENGAGEMENT_KINDS]).toEqual([...C1_DOCUMENTED_KINDS]);
    expect(Object.values(GIA_ENGAGEMENT)).toEqual([...C1_DOCUMENTED_KINDS]);
    expect([...G1_EMITTED_KINDS]).toEqual(['gia.conversation', 'gia.handoff', 'literacy.interest', 'fep.booked']);
    expect(g1MayEmit('fep.attended')).toBe(false);
    expect([...ENGAGEMENT_METADATA_KEYS]).toEqual(['intent', 'citation']);
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
      metadata: { intent: 'answer', citation: 'KP-LIT-01' },
    });
    expect(Object.keys(built.event).sort()).toEqual(['actor', 'candidateId', 'kind', 'metadata']);
  });

  it('refuses undocumented kinds and leader-only fep.attended', () => {
    expect(buildEngagementEvent({ kind: 'gia.stop', candidateId: 'x' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(buildEngagementEvent({ kind: 'gia.conversation_started', candidateId: 'x' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(buildEngagementEvent({ kind: 'fep.attended', candidateId: 'x' })).toMatchObject({ ok: false, error: 'kind_not_allowed' });
  });

  it('runs spec.metadata through the C1 intent/citation allowlist and drops extras', () => {
    const spec = {
      intent: 'answer',
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
      metadata: {
        intent: 'answer',
        citation: { id: 'KP-LIT-01' },
        email: 'visitor@example.test',
        phone: '+639170000000',
        message: 'raw chat',
        otp: '123456',
      },
    };
    const flattened = flattenEngagementMetadata(spec);
    expect(flattened).toEqual({ intent: 'answer', citation: 'KP-LIT-01' });
    expect(Object.keys(flattened).sort()).toEqual(['citation', 'intent']);
    expect(sanitizeEngagementMetadata(spec.metadata)).toEqual({ intent: 'answer', citation: 'KP-LIT-01' });
    expect(c1Sanitize({ intent: 'answer', citation: 'KP-LIT-01' })).toEqual({ intent: 'answer', citation: 'KP-LIT-01' });
    expect(() => c1Sanitize(spec.metadata)).toThrow(/invalid/);
  });

  it('rejects OTP- and code-shaped tokens on both C1 and G1', () => {
    for (const token of ['1234', '123456', '12 34 56', 'otp 99', 'access code L1-1234', 'FREE-ABCD', 'PRO-WXYZ']) {
      expect(looksLikeSecretToken(token)).toBe(true);
      expect(c1LooksLikeSecretToken(token)).toBe(true);
      expect(() => sanitizeEngagementMetadata({ intent: token })).toThrow(/invalid/);
      expect(() => c1Sanitize({ intent: token })).toThrow(/invalid/);
    }
    expect(looksLikeSecretToken('KP-LIT-01')).toBe(false);
    expect(c1LooksLikeSecretToken('KP-LIT-01')).toBe(false);
    expect(sanitizeEngagementMetadata({ citation: 'KP-LIT-01' })).toEqual({ citation: 'KP-LIT-01' });
  });

  it('redacts spaced OTPs and obfuscated emails without swallowing FAQ questions', () => {
    expect(c1LooksLikeSecretToken('12 34 56')).toBe(true);
    expect(c1LooksLikeSecretToken('123 456')).toBe(true);
    expect(c1LooksLikeContact('visitor at example.test')).toBe(true);
    expect(c1LooksLikeContact('visitor [at] example.test')).toBe(true);
    expect(c1LooksLikeContact('visitor[at]example.test')).toBe(true);
    expect(c1LooksLikeContact('visitor(at)example.test')).toBe(true);
    expect(c1LooksLikeSecretToken('１２３４５６')).toBe(true);
    expect(c1LooksLikeSecretToken('12\u200b34\u200c56')).toBe(true);
    expect(storeableMessageText('12 34 56', 'answer', null)).toBeNull();
    expect(storeableMessageText('visitor at example.test', 'answer', null)).toBeNull();
    expect(storeableMessageText('visitor[at]example.test', 'answer', null)).toBeNull();
    expect(storeableMessageText('１２３４５６', 'answer', null)).toBeNull();
    expect(storeableMessageText('12\u200b3456', 'answer', null)).toBeNull();
    expect(storeableMessageText('what is financial literacy', 'answer', null)).toBe('what is financial literacy');
    expect(storeableMessageText('when is the next FEP', 'answer', null)).toBe('when is the next FEP');
    expect(storeableMessageText('Talk to a 1CMA Leader', 'request_leader', null)).toBe('Talk to a 1CMA Leader');
    expect(looksLikeSecretToken('what is financial literacy')).toBe(false);
    expect(c1LooksLikeContact('meet at GIYA Institute')).toBe(false);
  });

  it('redacts unprefixed mixed codes and code-near-token phrases', () => {
    for (const probe of ['my code is A3F9C1', 'my versa code is K7QX-MZ2P-RT8W', 'code: KQXMZPRT', 'ang kodigo kay KQXMZPRT']) {
      expect(looksLikeSecretToken(probe)).toBe(true);
      expect(c1LooksLikeSecretToken(probe)).toBe(true);
      expect(storeableMessageText(probe, 'answer', null)).toBeNull();
    }
    expect(storeableMessageText('what is FEP', 'answer', null)).toBe('what is FEP');
    expect(storeableMessageText('the SPIKE Method', 'answer', null)).toBe('the SPIKE Method');
    expect(storeableMessageText('L2 is handled by a leader', 'answer', null)).toBe('L2 is handled by a leader');
    expect(storeableMessageText('FEP dates in 2026', 'answer', null)).toBe('FEP dates in 2026');
    expect(looksLikeSecretToken('KP-LIT-01')).toBe(false);
  });

  it('treats a mismatched candidateId as out of scope', () => {
    expect(callerOwnsCandidate('aaa', 'aaa')).toBe(true);
    expect(callerOwnsCandidate('aaa', undefined)).toBe(true);
    expect(callerOwnsCandidate('aaa', 'bbb')).toBe(false);
    expect(callerOwnsCandidate(null, 'bbb')).toBe(false);
    expect(callerOwnsCandidate('aaa', ['aaa'] as unknown)).toBe(false);
  });

  it('requires identity scope to list engagement rows and checks candidateId against it', async () => {
    await expect(engagementPort().list()).rejects.toThrow(/unscoped_list/);
    await expect(engagementPort().list('')).rejects.toThrow(/unscoped_list/);
    await expect(engagementPort().list({})).rejects.toThrow(/unscoped_list/);
    await expect(engagementPort().list({ candidateId: '11111111-1111-4111-8111-111111111111' })).rejects.toThrow(/unscoped_list/);
    await engagementPort().record({ identity: 'a', candidateId: '11111111-1111-4111-8111-111111111111', kind: 'gia.conversation', metadata: { intent: 'answer' } });
    await engagementPort().record({ identity: 'b', candidateId: '22222222-2222-4222-8222-222222222222', kind: 'gia.conversation', metadata: { intent: 'answer' } });
    expect((await engagementPort().list('a')).map(row => row.kind)).toEqual(['gia.conversation']);
    expect(await engagementPort().list({ identity: 'a', candidateId: '22222222-2222-4222-8222-222222222222' })).toEqual([]);
    expect((await engagementPort().list({ identity: 'a', candidateId: '11111111-1111-4111-8111-111111111111' })).map(row => row.candidateId)).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('caps the in-memory engagement port with a ring buffer', async () => {
    const port = createMemoryEngagementPort({ limit: 3 });
    for (let i = 0; i < 5; i++) {
      const recorded = await port.record({ identity: `id-${i}`, kind: 'gia.conversation', metadata: { intent: 'answer' } });
      expect(recorded.ok).toBe(true);
    }
    expect(await port.list('id-0')).toEqual([]);
    expect(await port.list('id-1')).toEqual([]);
    expect((await port.list('id-2')).map(row => row.identity)).toEqual(['id-2']);
    expect((await port.list('id-4')).map(row => row.identity)).toEqual(['id-4']);
  });

  it('wires canReadDomain so intern/RA cannot read FEP or literacy', () => {
    expect(canReadDomain(visitorRole({ program: 'intern' }), 'fep')).toBe(false);
    expect(canReadDomain(visitorRole({ program: 'ra' }), 'financial-literacy')).toBe(false);
    expect(canReadDomain(visitorRole({ program: 'recruit' }), 'financial-literacy')).toBe(true);
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
    await resetWorkflowTables((sql: string) => state.db!.exec(sql), WORKFLOW_RESET_TABLES);
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
    expect(result.events[0].metadata).toEqual({ intent: 'answer', citation: 'KP-LIT-01' });
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
  });

  it('does not persist PII or OTP-shaped tokens on a scoped conversation event', async () => {
    await perform(repository, 'engage-a', 'consent', consent);
    const result = await repository.run('engage-a', tx => emitGiaEngagement(tx, 'engage-a', {
      conversation: true,
      intent: 'answer',
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://example.test/kp' },
      metadata: { email: 'engage@example.test', phone: '+639170000000', message: 'secret chat', otp: '123456', intent: 'answer' },
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
    const rows = (await state.db!.query("SELECT kind, metadata FROM candidate_events WHERE kind='gia.conversation'")).rows as Array<{ kind: string; metadata: Record<string, unknown> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ intent: 'answer', citation: 'KP-LIT-01', officialDecision: false });
    expect(JSON.stringify(rows[0].metadata)).not.toMatch(/engage@example|639170000000|secret chat|123456/);
    const invalid = await repository.run('engage-a', tx => emitGiaEngagement(tx, 'engage-a', {
      conversation: true,
      metadata: { intent: '123456' },
    })) as { ok: boolean; error?: string };
    expect(invalid).toEqual({ ok: false, error: 'invalid' });
    const after = (await state.db!.query("SELECT metadata FROM candidate_events WHERE kind='gia.conversation'")).rows as Array<{ metadata: Record<string, unknown> }>;
    expect(after).toHaveLength(1);
    expect(JSON.stringify(after[0].metadata)).not.toMatch(/123456/);
  });
});

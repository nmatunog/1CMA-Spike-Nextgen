import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes } from 'node:crypto';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from './apply-migrations.mjs';

const SECRET = 'g'.repeat(32);
const sessionId = randomBytes(32).toString('hex');
const mac = createHmac('sha256', SECRET).update(sessionId).digest('hex');
const state = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  cookies: {} as Record<string, string>,
  setCalls: [] as Array<{ name: string; value: string }>,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => Object.prototype.hasOwnProperty.call(state.cookies, name) ? { value: state.cookies[name] } : undefined,
    set: (name: string, value: string) => {
      state.cookies[name] = value;
      state.setCalls.push({ name, value });
    },
  }),
}));
vi.mock('@/lib/gia/origin', () => ({ sameOrigin: () => true }));
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

process.env.GIA_SESSION_SECRET = SECRET;
process.env.GIA_PILOT_ENABLED = 'true';
process.env.GIA_OTP_DEV = 'true';
process.env.GIA_OTP_COOLDOWN_MS = '0';
process.env.DATABASE_URL = 'postgres://synthetic-api';
vi.stubEnv('NODE_ENV', 'test');

const { POST } = await import('@/app/api/gia/route');
const { clearDevOtps } = await import('./otp.mjs');
const { resetEngagementPort } = await import('./engagement.mjs');
const { WORKFLOW_ACTIONS } = await import('./workflow.mjs');

const SMUGGLE_SECRETS = [
  'redeem FREE-ABC12345',
  'redeem PRO-XYZ98765',
  '123456',
  '12 34 56',
  'visitor at example.test',
  'visitor@example.test',
  'visitor[at]example.test',
  'visitor(at)example.test',
  '09171234567',
  '１２３４５６',
  '12\u200b34\u200c56',
];
const SMUGGLE_LEAK = /FREE-ABC12345|PRO-XYZ98765|123456|12 34 56|visitor at example\.test|visitor@example\.test|visitor\[at\]example\.test|visitor\(at\)example\.test|09171234567|１２３４５６|12\u200b34\u200c56/;

function smuggleFields(secret: string) {
  return { text: secret, reason: secret, citation: secret, message: secret, note: secret, otp: secret, phone: secret };
}

const TABLES = WORKFLOW_RESET_TABLES;

describe('GIA API reject audit', () => {
  beforeAll(async () => {
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db.exec(sql));
  });
  beforeEach(async () => {
    await resetWorkflowTables((sql: string) => state.db.exec(sql), TABLES);
    clearDevOtps();
    resetEngagementPort();
    state.cookies = { gia_session: `${sessionId}.${mac}` };
    state.setCalls = [];
  });
  afterAll(async () => { await state.db.close(); });

  it('audits malformed, oversized, and unknown actions without payload secrets', async () => {
    const malformed = await POST(new Request('http://127.0.0.1/api/gia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-json' }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'malformed_request' });

    const oversized = await POST(new Request('http://127.0.0.1/api/gia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"action":"message","text":"${'x'.repeat(5000)}"}` }));
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: 'request_too_large' });

    const unknown = await POST(new Request('http://127.0.0.1/api/gia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel_fep', otp: '654321', secret: 'do-not-store' }) }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: 'unknown_action' });

    const rows = (await state.db.query("SELECT action,intent,outcome,message_text FROM gia_turns ORDER BY created_at")).rows as Array<{ action: string; intent: string | null; outcome: string; message_text: string | null }>;
    expect(rows.map(r => r.outcome)).toEqual(expect.arrayContaining(['malformed_request', 'request_too_large', 'unknown_action']));
    expect(rows.filter(r => r.outcome === 'unknown_action').every(r => r.action === 'rejected' && r.intent === 'rejected')).toBe(true);
    expect(rows.every(r => r.message_text == null)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/654321|do-not-store|not-json|cancel_fep/);
  });

  it('never returns a dev OTP code in API JSON', async () => {
    await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'consent', agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Visitor', email: 'visitor@example.test' }),
    }));
    const challenge = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get_my_status' }),
    }));
    const body = await challenge.json();
    expect(body.error).toBe('verification_required');
    expect(body.challenge).not.toHaveProperty('devCode');
    expect(JSON.stringify(body)).not.toMatch(/"devCode"/);
  });

  it('keeps an intern cookie when body.program is omitted and denies FEP listing', async () => {
    const sessionIdFep = '11111111-1111-4111-8111-111111111111';
    await state.db.query("INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval '3 days',5)", [sessionIdFep]);
    state.cookies.gia_program = 'intern';
    const listed = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list_fep_sessions' }),
    }));
    expect(listed.status).toBe(400);
    expect(await listed.json()).toEqual({ error: 'wrong_program' });
    expect(state.cookies.gia_program).toBe('intern');
  });

  it('rejects explicit null, empty, and garbage program instead of failing open to recruit', async () => {
    state.cookies.gia_program = 'intern';
    for (const program of [null, '']) {
      const res = await POST(new Request('http://127.0.0.1/api/gia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'list_fep_sessions', program }),
      }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_program' });
      expect(state.cookies.gia_program).toBe('intern');
    }
    state.cookies.gia_program = 'admin';
    const garbage = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list_fep_sessions' }),
    }));
    expect(garbage.status).toBe(400);
    expect(await garbage.json()).toEqual({ error: 'invalid_program' });
  });

  it('writes a minimal unconsented urgent handoff onto the staff queue', async () => {
    const { listHandoffs } = await import('@/lib/recruitment/store');
    const tag = Object.assign(async (parts: TemplateStringsArray, ...args: unknown[]) => {
      const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
      return (await state.db.query(text, args)).rows as Record<string, unknown>[];
    }, { json: (v: unknown) => JSON.stringify(v), begin: async () => { throw new Error('unused'); } });

    const res = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'message', text: 'thinking about suicide' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.citation).toMatchObject({ id: 'KP-SAFETY-01' });
    expect(body.reason).toBe('urgent');
    expect(body.handoff).toMatchObject({ reason: 'urgent', consented: false, program: 'recruit' });
    expect(body.handoff.candidate_id).toBeFalsy();
    expect(body.handoff.visitor_identity).toBe(sessionId);
    expect(body.handoff.created_at).toBeTruthy();
    expect(JSON.stringify(body.handoff)).not.toMatch(/thinking about suicide/i);

    const stored = (await state.db.query('SELECT candidate_id,reason,urgency,consented,program,visitor_identity,resolution,general_answer FROM candidate_handoffs')).rows as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].candidate_id).toBeNull();
    expect(stored[0]).toMatchObject({ reason: 'urgent', urgency: 'urgent', program: 'recruit', visitor_identity: sessionId });
    expect(stored[0].consented === false || stored[0].consented === 'f').toBe(true);
    expect(stored[0].resolution).toBeNull();
    expect(stored[0].general_answer).toBeNull();
    const turns = (await state.db.query("SELECT message_text,reason FROM gia_turns WHERE action='message'")).rows as Array<{ message_text: string | null; reason: string | null }>;
    expect(turns.every(row => row.message_text == null)).toBe(true);
    expect(turns.some(row => row.reason === 'urgent')).toBe(true);
    expect(JSON.stringify({ stored, turns })).not.toMatch(/thinking about suicide/i);

    const queue = await listHandoffs(tag, { email: 'leader@example.test', role: 'leader' }, {});
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      name: 'Unconsented visitor',
      reason: 'urgent',
      consented: false,
      program: 'recruit',
      visitor_identity: sessionId,
      candidate_id: null,
    });
    expect(queue[0].created_at).toBeTruthy();
  });

  it('serves KP-SAFETY-01 on intern even without recruit topics', async () => {
    state.cookies.gia_program = 'intern';
    await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'consent', agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Intern', email: 'intern@example.test' }),
    }));
    const res = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'message', text: 'I want to kill myself' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.citation).toMatchObject({ id: 'KP-SAFETY-01' });
    expect(body.reason).toBe('urgent');
    expect(body.text).toMatch(/NCMH Crisis Hotline at 1553/);
    expect(body.handoff).toBeTruthy();
  });

  it('does not serve recruit FEP FAQ on an intern cookie', async () => {
    state.cookies.gia_program = 'intern';
    const res = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'message', text: 'what is FEP' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intent).toBe('request_leader');
    expect(body.reason).toBe('route_spike_interns');
    expect(body.citation).toBeUndefined();
    expect(body.sessions).toBeUndefined();
  });

  it('rejects non-string program values instead of coercing them to recruit', async () => {
    const sessionIdFep = '22222222-2222-4222-8222-222222222222';
    await state.db.query("INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval '3 days',5)", [sessionIdFep]);
    const tampered = [['recruit'], [['recruit']], {}, 0, true];
    const cookies = ['intern', 'ra', 'admin'];
    for (const cookie of cookies) {
      for (const program of tampered) {
        state.cookies.gia_program = cookie;
        state.setCalls = [];
        for (const extra of [
          { action: 'list_fep_sessions' },
          { action: 'book_fep', sessionId: sessionIdFep },
          { action: 'message', text: 'what is FEP' },
        ]) {
          const res = await POST(new Request('http://127.0.0.1/api/gia', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...extra, program }),
          }));
          const body = await res.json();
          expect(res.status).toBe(400);
          expect(body.error).toBe('invalid_program');
          expect(body.error).not.toBe('consent_required');
          expect(body.sessions).toBeUndefined();
          expect(body.citation).toBeUndefined();
          expect(JSON.stringify(body)).not.toMatch(/KP-FEP-01/);
          expect(state.cookies.gia_program).toBe(cookie);
          expect(state.setCalls.filter(call => call.name === 'gia_program')).toEqual([]);
        }
      }
    }
  });

  it('honors STOP before a non-string program value', async () => {
    state.cookies.gia_program = 'intern';
    const res = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'opt_out', program: ['recruit'] }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, message: expect.stringMatching(/opted out/i) });
    expect(state.cookies.gia_program).toBe('intern');
    const stopped = await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'message', text: 'STOP', program: [['recruit']] }),
    }));
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toMatchObject({ ok: true });
  });

  it('never persists smuggled secrets on any WORKFLOW_ACTIONS intent', async () => {
    const sessionIdFep = '33333333-3333-4333-8333-333333333333';
    await state.db.query("INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval '3 days',5)", [sessionIdFep]);
    const post = (body: Record<string, unknown>) => POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect([...WORKFLOW_ACTIONS]).toEqual(['consent', 'list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']);
    for (const secret of SMUGGLE_SECRETS) {
      const listed = await post({ action: 'list_fep_sessions', ...smuggleFields(secret) });
      expect(listed.status).toBe(200);
    }
    for (const secret of SMUGGLE_SECRETS) {
      const consented = await post({
        action: 'consent',
        agree: true,
        notice: 'gia-pilot-2026-11-04',
        name: 'Synthetic Visitor',
        email: 'ok@example.test',
        ...smuggleFields(secret),
      });
      expect(consented.status).toBe(200);
    }
    for (const action of WORKFLOW_ACTIONS as readonly string[]) {
      for (const secret of SMUGGLE_SECRETS) {
        const extra: Record<string, unknown> = { action, ...smuggleFields(secret) };
        if (action === 'consent') {
          extra.agree = true;
          extra.notice = 'gia-pilot-2026-11-04';
          extra.name = 'Synthetic Visitor';
          extra.email = 'ok@example.test';
        }
        if (action === 'book_fep') extra.sessionId = sessionIdFep;
        const res = await post(extra);
        expect([200, 400]).toContain(res.status);
      }
    }
    const turns = (await state.db.query('SELECT * FROM gia_turns')).rows as Array<{ action: string; message_text: string | null; reason: string | null }>;
    const events = (await state.db.query('SELECT kind,actor,metadata FROM candidate_events')).rows;
    const handoffs = (await state.db.query('SELECT reason,urgency,resolution,general_answer FROM candidate_handoffs')).rows;
    expect(turns.some(row => (WORKFLOW_ACTIONS as readonly string[]).includes(row.action))).toBe(true);
    expect(JSON.stringify({ turns, events, handoffs })).not.toMatch(SMUGGLE_LEAK);
    expect(turns.every(row => row.message_text == null)).toBe(true);
    expect(turns.every(row => row.reason == null || ['leader_requested', 'fep_change'].includes(row.reason))).toBe(true);
  });

  it('never persists a pasted FREE/PRO code or 6-digit OTP in gia_turns', async () => {
    const secrets = ['redeem FREE-ABC12345', 'redeem PRO-XYZ98765', '123456', 'visitor[at]example.test', '１２３４５６', '12\u200b3456', 'my code is A3F9C1', 'my versa code is K7QX-MZ2P-RT8W', 'code: KQXMZPRT'];
    for (const text of secrets) {
      const res = await POST(new Request('http://127.0.0.1/api/gia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'message', text }),
      }));
      expect(res.status).toBe(200);
    }
    const rows = (await state.db.query("SELECT action,intent,message_text FROM gia_turns WHERE action='message'")).rows as Array<{ action: string; intent: string | null; message_text: string | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every(row => row.message_text == null)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/FREE-ABC12345|PRO-XYZ98765|123456|visitor\[at\]example\.test|１２３４５６|A3F9C1|K7QX-MZ2P-RT8W|KQXMZPRT/);
    for (const text of ['what is financial literacy', 'what is FEP', 'the SPIKE Method', 'L2 is handled by a leader', 'FEP dates in 2026']) {
      const faq = await POST(new Request('http://127.0.0.1/api/gia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'message', text }),
      }));
      expect(faq.status).toBe(200);
      const stored = (await state.db.query("SELECT message_text FROM gia_turns WHERE action='message' ORDER BY created_at DESC LIMIT 1")).rows as Array<{ message_text: string | null }>;
      expect(stored[0]?.message_text).toBe(text);
    }
  });

  it('dedupes repeated unrecognized messages from the same candidate', async () => {
    await POST(new Request('http://127.0.0.1/api/gia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'consent', agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Visitor', email: 'visitor@example.test' }),
    }));
    const text = 'asdf qwerty unknown gibberish please connect me';
    for (let i = 0; i < 2; i++) {
      const res = await POST(new Request('http://127.0.0.1/api/gia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'message', text }),
      }));
      expect(res.status).toBe(200);
      expect((await res.json()).intent).toBe('request_leader');
    }
    const handoffs = (await state.db.query('SELECT reason,state FROM candidate_handoffs')).rows as Array<{ reason: string; state: string }>;
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]).toMatchObject({ reason: 'unapproved_or_unknown', state: 'open' });
    const created = (await state.db.query("SELECT * FROM candidate_events WHERE kind='handoff.created'")).rows;
    expect(created).toHaveLength(1);
  });
});

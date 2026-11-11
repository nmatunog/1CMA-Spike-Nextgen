import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes } from 'node:crypto';
import { applyAllMigrations } from './apply-migrations.mjs';

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

const TABLES = 'candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,landing_quiz_results,versa_lead_map,candidate_duplicate_flags,import_batches,command_audit_events,gia_otp_challenges,gia_otp_throttle,gia_turns';

describe('GIA API reject audit', () => {
  beforeAll(async () => {
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db.exec(sql));
  });
  beforeEach(async () => {
    await state.db.exec('ALTER TABLE gia_turns DISABLE TRIGGER USER');
    await state.db.exec(`TRUNCATE ${TABLES} CASCADE`);
    await state.db.exec('ALTER TABLE gia_turns ENABLE TRIGGER USER');
    clearDevOtps();
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

    const rows = (await state.db.query("SELECT action,outcome,message_text FROM gia_turns ORDER BY created_at")).rows as Array<{ action: string; outcome: string; message_text: string | null }>;
    expect(rows.map(r => r.outcome)).toEqual(expect.arrayContaining(['malformed_request', 'request_too_large', 'unknown_action']));
    expect(rows.every(r => r.message_text == null)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/654321|do-not-store|not-json/);
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
});

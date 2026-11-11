import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes } from 'node:crypto';
import { applyAllMigrations } from './apply-migrations.mjs';

const SECRET = 'g'.repeat(32);
const sessionId = randomBytes(32).toString('hex');
const mac = createHmac('sha256', SECRET).update(sessionId).digest('hex');
const state = vi.hoisted(() => ({ db: null as unknown as PGlite }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => name === 'gia_session' ? { value: `${sessionId}.${mac}` } : undefined,
    set: () => undefined,
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
});

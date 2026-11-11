import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { perform, GIA_TOOLS } from './workflow.mjs';
const state = vi.hoisted(() => ({ db: null }));
// Run production repository SQL against embedded PostgreSQL. Advisory locks are
// excluded: real multi-connection contention is a separate staging check.
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
import { repository, listSessions } from './repository';
const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Visitor', email: 'visitor@example.test' };
beforeAll(async () => {
  process.env.GIA_SESSION_SECRET = 'g'.repeat(32);
  process.env.GIA_OTP_DEV = 'true';
  state.db = new PGlite();
  process.env.DATABASE_URL = 'postgres://synthetic-test';
  await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
  await state.db.exec(await readFile('migrations/0001_gia_recruitment.sql','utf8'));
  await state.db.exec(await readFile('migrations/0003_gia_otp_turns_retention.sql','utf8'));
});
beforeEach(async () => { await state.db.exec('TRUNCATE candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions,gia_otp_challenges,gia_turns CASCADE'); });
afterAll(async () => { await state.db.close(); });
describe('shared candidate workflow using PostgreSQL SQL', () => {
  const query = async (q, params) => (await state.db.query(q, params)).rows;
  it('requires informed consent before candidate creation', async () => {
    await expect(perform(repository,'a','book_fep',{sessionId:randomUUID()})).rejects.toThrow('consent_required');
    await expect(perform(repository,'a','consent',{...consent,agree:false})).rejects.toThrow('consent_required');
    expect(await query('SELECT * FROM candidates')).toHaveLength(0);
  });
  it('retries consent without duplicate candidates or events', async () => {
    await perform(repository,'a','consent',consent); await perform(repository,'a','consent',consent);
    expect(await query('SELECT * FROM candidates')).toHaveLength(1); expect(await query("SELECT * FROM candidate_events WHERE kind='consent.granted'")).toHaveLength(1);
  });
  it('never merges unverified email contacts', async () => {
    await perform(repository,'a','consent',consent); await perform(repository,'b','consent',consent);
    expect(await query('SELECT * FROM candidates')).toHaveLength(2);
  });
  it('shares handoff identity and handles duplicate requests', async () => {
    await perform(repository,'a','consent',consent);
    const h = await perform(repository,'a','request_leader',{reason:'leader_requested'});
    expect((await perform(repository,'a','request_leader',{reason:'leader_requested'})).handoff.id).toBe(h.handoff.id);
    expect(await query('SELECT * FROM candidates c JOIN candidate_handoffs h ON h.candidate_id=c.id')).toHaveLength(1);
    expect(await query("SELECT * FROM candidate_events WHERE kind='handoff.created'")).toHaveLength(1);
  });
  it('books exactly once and reports full sessions as failure', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',1)',[sessionId]);
    await perform(repository,'a','consent',consent); await perform(repository,'b','consent',consent);
    const first=await perform(repository,'a','book_fep',{sessionId});
    expect((await perform(repository,'a','book_fep',{sessionId})).booking.id).toBe(first.booking.id);
    await expect(perform(repository,'b','book_fep',{sessionId})).rejects.toThrow('session_full');
    expect(await query('SELECT * FROM fep_bookings')).toHaveLength(1);
    expect((await listSessions())[0].seats_left).toBe(0);
    expect(await query("SELECT * FROM candidate_events WHERE kind='fep.booked'")).toHaveLength(1);
  });
  it('rolls back a failed booking without changing stage', async () => {
    await perform(repository,'a','consent',consent);
    await expect(perform(repository,'a','book_fep',{sessionId:randomUUID()})).rejects.toThrow('session_unavailable');
    expect((await query('SELECT stage FROM candidates'))[0].stage).toBe('new_lead');
  });
  it('refuses personal status even with a consented web session until OTP', async () => {
    await perform(repository,'a','consent',consent);
    const refused = await perform(repository,'a','get_my_status');
    expect(refused.error).toBe('verification_required');
    expect(refused.status).toBeUndefined();
  });
  it('STOP cancels handoffs, revokes all source consents, and suppresses retries', async () => {
    await perform(repository,'a','consent',consent); await perform(repository,'a','request_leader');
    await perform(repository,'a','opt_out'); await perform(repository,'a','opt_out');
    expect((await query('SELECT stage FROM candidates'))[0].stage).toBe('opt_out');
    expect((await query('SELECT state FROM candidate_handoffs'))[0].state).toBe('cancelled');
    expect((await query('SELECT revoked_at FROM candidate_consents'))[0].revoked_at).toBeTruthy();
    await expect(perform(repository,'a','request_leader')).rejects.toThrow('opted_out');
    await expect(perform(repository,'a','consent',consent)).rejects.toThrow('opted_out');
    expect(await query("SELECT * FROM candidate_events WHERE kind='opt_out'")).toHaveLength(1);
  });
  it('retains pre-consent STOP without creating personal records', async () => {
    await perform(repository,'a','opt_out');
    expect(await query('SELECT * FROM candidates')).toHaveLength(0);
    await expect(perform(repository,'a','consent',consent)).rejects.toThrow('opted_out');
  });
  it('protects audit events from mutation', async () => {
    await perform(repository,'a','consent',consent);
    await expect(state.db.exec("UPDATE candidate_events SET kind='changed'")).rejects.toThrow('append-only');
    await expect(state.db.exec('DELETE FROM candidate_events')).rejects.toThrow('append-only');
  });
  it('opens a new request after a prior handoff has been resolved', async () => {
    await perform(repository,'a','consent',consent);
    const first=await perform(repository,'a','request_leader');
    await state.db.exec("UPDATE candidate_handoffs SET state='resolved'");
    const next=await perform(repository,'a','request_leader');
    expect(next.handoff.id).not.toBe(first.handoff.id);
  });
});

describe('five GIA tools, OTP gating and turn audit', () => {
  const query = async (q, params) => (await state.db.query(q, params)).rows;
  it('exposes exactly the five approved tools and rejects cancel_fep', async () => {
    expect([...GIA_TOOLS].sort()).toEqual(['book_fep','get_my_status','list_fep_sessions','opt_out','request_leader']);
    await expect(perform(repository,'a','cancel_fep')).rejects.toThrow('unknown_action');
  });
  it('lists FEP sessions without consent and audits the turn', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    const listed = await perform(repository,'a','list_fep_sessions');
    expect(listed.sessions).toHaveLength(1);
    expect(listed.sessions[0].seats_left).toBe(5);
    expect(await query("SELECT action,outcome FROM gia_turns WHERE identity='a' AND action='list_fep_sessions'")).toHaveLength(1);
  });
  it('blocks list_fep_sessions after STOP', async () => {
    await perform(repository,'a','opt_out');
    await expect(perform(repository,'a','list_fep_sessions')).rejects.toThrow('opted_out');
  });
  it('routes a second FEP session through request_leader fep_change without moving the booking', async () => {
    const first=randomUUID(); const second=randomUUID();
    await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5),($2,now()+interval \'10 days\',5)',[first,second]);
    await perform(repository,'a','consent',consent);
    const booked = await perform(repository,'a','book_fep',{sessionId:first});
    const changed = await perform(repository,'a','book_fep',{sessionId:second});
    expect(changed.booking).toBeUndefined();
    expect(changed.reason).toBe('fep_change');
    expect(changed.handoff.id).toBeTruthy();
    expect(await query('SELECT session_id FROM fep_bookings')).toEqual([{ session_id: first }]);
    expect(booked.booking.id).toBeTruthy();
  });
  it('returns only the requester own status after mock OTP and refuses the other identity', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    await perform(repository,'a','consent',consent);
    await perform(repository,'b','consent',{...consent,email:'other@example.test'});
    await perform(repository,'a','book_fep',{sessionId});
    const challenge = await perform(repository,'a','get_my_status');
    expect(challenge.error).toBe('verification_required');
    expect(challenge.challenge.devCode).toMatch(/^\d{6}$/);
    const mine = await perform(repository,'a','get_my_status',{otp:challenge.challenge.devCode});
    expect(mine.status.stage).toBe('fep_booked');
    expect(mine.status.bookingId).toBeTruthy();
    const other = await perform(repository,'b','get_my_status');
    expect(other.error).toBe('verification_required');
    const otherCode = other.challenge.devCode;
    const otherStatus = await perform(repository,'b','get_my_status',{otp:otherCode});
    expect(otherStatus.status.stage).toBe('new_lead');
    expect(otherStatus.status.bookingId).toBeNull();
  });
  it('rejects a wrong OTP and does not return status', async () => {
    await perform(repository,'a','consent',consent);
    await perform(repository,'a','get_my_status');
    await expect(perform(repository,'a','get_my_status',{otp:'000000'})).rejects.toThrow('verification_required');
    expect(await query("SELECT verified_at FROM gia_otp_challenges WHERE verified_at IS NOT NULL")).toHaveLength(0);
  });
  it('audits every successful tool call including opt_out on the existing STOP path', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    await perform(repository,'a','list_fep_sessions');
    await perform(repository,'a','consent',consent);
    await perform(repository,'a','book_fep',{sessionId});
    await perform(repository,'a','request_leader',{reason:'leader_requested'});
    await perform(repository,'a','get_my_status');
    await perform(repository,'a','opt_out');
    const actions = (await query("SELECT action FROM gia_turns WHERE identity='a' ORDER BY created_at")).map(r=>r.action);
    expect(actions).toEqual(expect.arrayContaining(['list_fep_sessions','consent','book_fep','request_leader','get_my_status','opt_out']));
  });
  it('protects gia_turns from mutation', async () => {
    await perform(repository,'a','consent',consent);
    await expect(state.db.exec("UPDATE gia_turns SET outcome='changed'")).rejects.toThrow('append-only');
  });
});

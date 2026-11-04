import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { perform } from './workflow.mjs';
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
describe('shared candidate workflow using PostgreSQL SQL', () => {
  beforeAll(async () => {
    state.db = new PGlite();
    process.env.DATABASE_URL = 'postgres://synthetic-test';
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await state.db.exec(await readFile('migrations/0001_gia_recruitment.sql','utf8'));
  });
  beforeEach(async () => { await state.db.exec('TRUNCATE candidates,candidate_identities,candidate_consents,candidate_events,candidate_handoffs,fep_sessions,fep_bookings,gia_suppressions CASCADE'); });
  afterAll(async () => { await state.db.close(); });
  const query = async (q) => (await state.db.query(q)).rows;
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
  it('refuses personal status even with a consented web session', async () => {
    await perform(repository,'a','consent',consent); await expect(perform(repository,'a','get_my_status')).rejects.toThrow('verification_required');
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

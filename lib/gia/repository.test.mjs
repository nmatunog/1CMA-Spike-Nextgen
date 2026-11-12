import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { perform, GIA_TOOLS, WORKFLOW_ACTIONS, pickWorkflowInput } from './workflow.mjs';
import { peekDevOtp, clearDevOtps, OTP_MAX_ATTEMPTS } from './otp.mjs';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from './apply-migrations.mjs';
import { programSource, resetProgramSource } from './program-source.mjs';
import { resetEngagementPort } from './engagement.mjs';
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
const TABLES = WORKFLOW_RESET_TABLES;
async function resetTables() {
  try { await state.db.exec('RESET SESSION AUTHORIZATION'); } catch { /* PGlite may already be the table owner */ }
  try { await state.db.exec('RESET ROLE'); } catch { /* ignore */ }
  await resetWorkflowTables((sql) => state.db.exec(sql), TABLES);
  clearDevOtps();
  resetProgramSource();
  resetEngagementPort();
}
beforeAll(async () => {
  process.env.GIA_SESSION_SECRET = 'g'.repeat(32);
  process.env.GIA_OTP_DEV = 'true';
  process.env.GIA_OTP_COOLDOWN_MS = '0';
  state.db = new PGlite();
  process.env.DATABASE_URL = 'postgres://synthetic-test';
  await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
  await applyAllMigrations(sql => state.db.exec(sql));
});
beforeEach(resetTables);
afterAll(async () => { await state.db.close(); });
describe('shared candidate workflow using PostgreSQL SQL', () => {
  const query = async (q, params) => (await state.db.query(q, params)).rows;
  it('never persists smuggled secrets on WORKFLOW_ACTIONS including pre-consent list and consent', async () => {
    const secrets = ['redeem FREE-ABC12345', 'redeem PRO-XYZ98765', '123456', '12 34 56', 'visitor at example.test', 'visitor@example.test', 'visitor[at]example.test', 'visitor(at)example.test', '09171234567', '１２３４５６', '12\u200b34\u200c56'];
    const leak = /FREE-ABC12345|PRO-XYZ98765|123456|12 34 56|visitor at example\.test|visitor@example\.test|visitor\[at\]example\.test|visitor\(at\)example\.test|09171234567|１２３４５６|12\u200b34\u200c56/;
    const smuggle = (secret) => ({ text: secret, reason: secret, citation: secret, message: secret, note: secret, otp: secret, phone: secret });
    const sessionId = randomUUID();
    await state.db.query("INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval '3 days',5)", [sessionId]);
    expect([...WORKFLOW_ACTIONS]).toEqual(['consent', ...GIA_TOOLS]);
    expect(pickWorkflowInput('list_fep_sessions', { program: 'recruit', reason: 'FREE-ABC12345', text: 'x' })).toEqual({ program: 'recruit' });
    expect(pickWorkflowInput('request_leader', { reason: 'leader_requested', text: 'x' })).toEqual({ reason: 'leader_requested' });
    expect(pickWorkflowInput('request_leader', { reason: 'FREE-ABC12345' })).toEqual({});
    for (const secret of secrets) {
      await perform(repository, 'smuggle-a', 'list_fep_sessions', smuggle(secret));
    }
    for (const secret of secrets) {
      await perform(repository, 'smuggle-a', 'consent', { ...consent, email: 'ok@example.test', ...smuggle(secret) });
    }
    for (const action of WORKFLOW_ACTIONS) {
      for (const secret of secrets) {
        const extra = action === 'consent' ? { ...consent, email: 'ok@example.test', ...smuggle(secret) }
          : action === 'book_fep' ? { sessionId, ...smuggle(secret) }
          : smuggle(secret);
        if (action === 'get_my_status') {
          const result = await perform(repository, 'smuggle-a', action, extra);
          expect(result.ok === false || result.ok === true).toBe(true);
        } else {
          await perform(repository, 'smuggle-a', action, extra);
        }
      }
    }
    const turns = await query('SELECT * FROM gia_turns');
    const events = await query('SELECT kind,actor,metadata FROM candidate_events');
    const handoffs = await query('SELECT reason,urgency,resolution,general_answer FROM candidate_handoffs');
    expect(turns.some(row => WORKFLOW_ACTIONS.includes(row.action))).toBe(true);
    expect(JSON.stringify({ turns, events, handoffs })).not.toMatch(leak);
    expect(turns.every(row => row.message_text == null)).toBe(true);
    expect(turns.every(row => row.reason == null || ['leader_requested', 'fep_change'].includes(row.reason))).toBe(true);
  });
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
  it('dedupes repeated unrecognized messages into one open handoff', async () => {
    await perform(repository,'a','consent',consent);
    const first = await perform(repository,'a','request_leader',{reason:'unapproved_or_unknown'});
    const second = await perform(repository,'a','request_leader',{reason:'unapproved_or_unknown'});
    expect(second.handoff.id).toBe(first.handoff.id);
    expect(await query("SELECT * FROM candidate_handoffs WHERE reason='unapproved_or_unknown'")).toHaveLength(1);
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
    const booked = await query("SELECT metadata FROM candidate_events WHERE kind='fep.booked'");
    expect(booked).toHaveLength(1);
    expect(booked[0].metadata).toMatchObject({ intent: 'book_fep', officialDecision: false });
    expect(JSON.stringify(booked[0].metadata)).not.toMatch(/sessionId/);
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
  it('STOP cancels acknowledged handoffs as well as open ones', async () => {
    await perform(repository,'a','consent',consent); await perform(repository,'a','request_leader');
    await state.db.exec("UPDATE candidate_handoffs SET state='acknowledged'");
    await perform(repository,'a','opt_out');
    expect((await query('SELECT state FROM candidate_handoffs'))[0].state).toBe('cancelled');
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
  it('applies numbered migrations in order including a future 0002', async () => {
    const { listMigrationFiles } = await import('./apply-migrations.mjs');
    const files = await listMigrationFiles();
    expect(files[0]).toBe('0001_gia_recruitment.sql');
    expect(files).toContain('0002_cc02a_command_center.sql');
    expect(files).toContain('0003_gia_otp_turns_retention.sql');
    expect(files).toContain('0004_cc02b_csv.sql');
    expect(files).toContain('0005_gia_app_role_policies.sql');
    expect(files).toContain('0006_app_role_full_access.sql');
    expect([...files].sort()).toEqual(files);
  });
  it('exposes exactly the five approved tools and rejects cancel_fep', async () => {
    expect([...GIA_TOOLS].sort()).toEqual(['book_fep','get_my_status','list_fep_sessions','opt_out','request_leader']);
    await expect(perform(repository,'a','cancel_fep')).rejects.toThrow('unknown_action');
    const rejected = await query("SELECT action,intent,outcome FROM gia_turns WHERE identity='a' AND outcome='unknown_action'");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toEqual({ action: 'rejected', intent: 'rejected', outcome: 'unknown_action' });
    await perform(repository,'a','consent',consent);
    await expect(perform(repository,'a','drop_table')).rejects.toThrow('unknown_action');
    const events = await query("SELECT metadata FROM candidate_events WHERE kind='gia.turn'");
    expect(JSON.stringify(events)).not.toMatch(/cancel_fep|drop_table/);
    expect(events.some(row => row.metadata.action === 'rejected' && row.metadata.intent === 'rejected' && row.metadata.outcome === 'unknown_action')).toBe(true);
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
    expect(challenge.challenge).not.toHaveProperty('devCode');
    const mine = await perform(repository,'a','get_my_status',{otp:peekDevOtp('a')});
    expect(mine.status.stage).toBe('fep_booked');
    expect(mine.status.bookingId).toBeTruthy();
    const other = await perform(repository,'b','get_my_status');
    expect(other.error).toBe('verification_required');
    expect(other.challenge).not.toHaveProperty('devCode');
    const otherStatus = await perform(repository,'b','get_my_status',{otp:peekDevOtp('b')});
    expect(otherStatus.status.stage).toBe('new_lead');
    expect(otherStatus.status.bookingId).toBeNull();
  });
  it('rejects a wrong OTP, persists the attempt, and does not return status', async () => {
    await perform(repository,'a','consent',consent);
    await perform(repository,'a','get_my_status');
    const refused = await perform(repository,'a','get_my_status',{otp:'000000'});
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe('verification_required');
    expect(refused.status).toBeUndefined();
    expect(await query("SELECT verified_at FROM gia_otp_challenges WHERE verified_at IS NOT NULL")).toHaveLength(0);
    expect(Number((await query('SELECT attempts FROM gia_otp_challenges'))[0].attempts)).toBe(1);
  });
  it('locks the SQL OTP challenge after the max wrong attempts so the real code fails', async () => {
    await perform(repository,'a','consent',consent);
    await perform(repository,'a','get_my_status');
    const real = peekDevOtp('a');
    expect(real).toMatch(/^\d{6}$/);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      const refused = await perform(repository,'a','get_my_status',{otp:'000000'});
      expect(refused.ok).toBe(false);
    }
    expect(Number((await query('SELECT attempts FROM gia_otp_challenges'))[0].attempts)).toBe(OTP_MAX_ATTEMPTS);
    const locked = await perform(repository,'a','get_my_status',{otp:real});
    expect(locked.error).toBe('otp_locked');
    expect(locked.status).toBeUndefined();
    expect(await query('SELECT verified_at FROM gia_otp_challenges WHERE verified_at IS NOT NULL')).toHaveLength(0);
  });
  it('throttles issuing a new SQL OTP per identity and hashed IP', async () => {
    process.env.GIA_OTP_COOLDOWN_MS = '60000';
    try {
      await perform(repository,'a','consent',consent);
      await perform(repository,'a','get_my_status',{clientHash:'ip-hash-a'});
      await state.db.exec("UPDATE gia_otp_challenges SET expires_at = now() - interval '1 second'");
      await expect(perform(repository,'a','get_my_status',{clientHash:'ip-hash-a'})).rejects.toThrow('otp_throttled');
    } finally {
      process.env.GIA_OTP_COOLDOWN_MS = '0';
    }
  });
  it('rejects an expired SQL OTP without marking it verified', async () => {
    await perform(repository,'a','consent',consent);
    await perform(repository,'a','get_my_status');
    const real = peekDevOtp('a');
    await state.db.exec("UPDATE gia_otp_challenges SET expires_at = now() - interval '1 second'");
    const refused = await perform(repository,'a','get_my_status',{otp:real});
    expect(refused.error).toBe('verification_required');
    expect(await query('SELECT verified_at FROM gia_otp_challenges WHERE verified_at IS NOT NULL')).toHaveLength(0);
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
  it('protects gia_turns from mutation and TRUNCATE', async () => {
    await perform(repository,'a','consent',consent);
    await expect(state.db.exec("UPDATE gia_turns SET outcome='changed'")).rejects.toThrow('append-only');
    await expect(state.db.exec('TRUNCATE gia_turns')).rejects.toThrow('append-only');
  });
  it('forces RLS and deny-by-default policies on GIA tables', async () => {
    const rows = await query("SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('gia_otp_challenges','gia_otp_throttle','gia_turns','gia_retention_config') ORDER BY c.relname");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
    const policies = await query("SELECT tablename, policyname, qual FROM pg_policies WHERE tablename IN ('gia_otp_challenges','gia_otp_throttle','gia_turns','gia_retention_config')");
    expect(policies.filter(p => /deny/.test(p.policyname)).every(p => p.qual === 'false')).toBe(true);
    expect(policies.filter(p => /owner_all$/.test(p.policyname)).every(p => p.qual === 'true')).toBe(true);
  });
  it('lets a non-BYPASSRLS app role use GIA tables and still denies anon', async () => {
    const app = await query("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname='gia_app'");
    expect(app).toHaveLength(1);
    expect(app[0].rolbypassrls).toBe(false);
    await perform(repository,'a','consent',consent);
    await state.db.exec('SET ROLE gia_app');
    try {
      const turns = await query('SELECT action FROM gia_turns');
      expect(turns.length).toBeGreaterThan(0);
      await state.db.exec("INSERT INTO gia_otp_challenges(identity,destination_hash,channel,code_hash,expires_at) VALUES('rls-probe','x','email','y',now()+interval '1 minute')");
      await state.db.exec("INSERT INTO gia_otp_throttle(key_hash,last_issued_at,window_started_at,window_count) VALUES('rls-probe',now(),now(),1)");
    } finally {
      await state.db.exec('RESET ROLE');
    }
  });
  it('refuses intern FEP booking and still requires OTP then STOP', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    await perform(repository,'intern-a','consent',{...consent, email:'intern@example.test'});
    await expect(perform(repository,'intern-a','book_fep',{sessionId, program:'intern'})).rejects.toThrow('wrong_program');
    await expect(perform(repository,'intern-a','list_fep_sessions',{program:'intern'})).rejects.toThrow('wrong_program');
    const refused = await perform(repository,'intern-a','get_my_status',{program:'intern'});
    expect(refused.error).toBe('verification_required');
    programSource().seed('intern','intern-a',{stage:'explore'});
    const mine = await perform(repository,'intern-a','get_my_status',{program:'intern', otp:peekDevOtp('intern-a')});
    expect(mine.status.stage).toBe('new_lead');
    expect(mine.status.program).toBe('intern');
    expect(mine.status.programSource).toBe('synthetic');
    expect(mine.status.programStage).toBe('explore');
    expect(JSON.stringify(mine)).not.toMatch(/portal\.1cma/i);
    const stopped = await perform(repository,'intern-a','opt_out',{program:'intern'});
    expect(stopped.ok).toBe(true);
    await expect(perform(repository,'intern-a','get_my_status',{program:'intern'})).rejects.toThrow('opted_out');
  });
  it('does not treat null or empty program as a recruit switch', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    await expect(perform(repository,'tamper-a','list_fep_sessions',{program:null})).rejects.toThrow('invalid_program');
    await expect(perform(repository,'tamper-a','list_fep_sessions',{program:''})).rejects.toThrow('invalid_program');
    await expect(perform(repository,'tamper-a','list_fep_sessions',{program:'admin'})).rejects.toThrow('invalid_program');
    const listed = await perform(repository,'tamper-a','list_fep_sessions');
    expect(listed.sessions).toHaveLength(1);
    const stopped = await perform(repository,'tamper-a','opt_out',{program:null});
    expect(stopped.ok).toBe(true);
  });
  it('does not coerce non-string program values into recruit', async () => {
    const sessionId=randomUUID(); await state.db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,now()+interval \'3 days\',5)',[sessionId]);
    for (const program of [['recruit'], [['recruit']], {}, 0, true]) {
      await expect(perform(repository,'tamper-b','list_fep_sessions',{program})).rejects.toThrow('invalid_program');
      await expect(perform(repository,'tamper-b','book_fep',{sessionId, program})).rejects.toThrow('invalid_program');
    }
    const stopped = await perform(repository,'tamper-b','opt_out',{program:['recruit']});
    expect(stopped.ok).toBe(true);
  });
  it('revokes anon and authenticated on CC-02b CSV tables', async () => {
    const { readFile } = await import('node:fs/promises');
    const sql = await readFile('migrations/0005_gia_app_role_policies.sql', 'utf8');
    expect(sql).toMatch(/REVOKE ALL ON versa_lead_map, import_batches, command_audit_events, candidate_duplicate_flags FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON versa_lead_map, import_batches, command_audit_events, candidate_duplicate_flags FROM authenticated/);
  });
});

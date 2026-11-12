import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { applyAllMigrations, futureFepInsertSql, seedFutureFep, resetWorkflowTables, WORKFLOW_RESET_TABLES } from './demo-seed.mjs';
import { applyCandidateStop, assertWritable, isStopped, STOP_STAGE } from './suppression';
import { WRITABLE_STAGES } from './stages';
import { dashboardCounts, listCandidates, listHandoffs, saveFollowUp, stopCandidate, parseFollowUpBody, recordEvaluation } from './store';
import { manilaDaysAgo, manilaToday } from './time';
import type { Sql } from './store';
import type { StaffActor } from './types';

const state = { db: null as unknown as PGlite };

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };

async function q(sql: string, params: unknown[] = []) {
  return (await state.db.query(sql, params)).rows as Record<string, unknown>[];
}

describe('CC-02a command center', () => {
  beforeAll(async () => {
    process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({
      'admin@example.test': 'admin',
      'leader@example.test': 'leader',
    });
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db.exec(sql));
  });
  beforeEach(async () => {
    await resetWorkflowTables((sql: string) => state.db.exec(sql), WORKFLOW_RESET_TABLES);
  });
  afterAll(async () => { await state.db.close(); });

  it('applies 0001 then 0002 on a fresh candidates table', async () => {
    const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='candidates' AND column_name IN ('literacy_status','spike_paid','stage')`);
    expect(cols.map((c) => c.column_name).sort()).toEqual(['literacy_status', 'spike_paid', 'stage']);
    expect(await q('SELECT 1 FROM landing_quiz_results')).toHaveLength(0);
  });

  it('keeps a future FEP seed so booking remains possible', async () => {
    expect(futureFepInsertSql()).toMatch(/now\(\)/);
    expect(futureFepInsertSql()).not.toMatch('2026-11-07');
    await seedFutureFep((sql: string) => state.db.exec(sql));
    const rows = await q('SELECT starts_at > now() AS future FROM fep_sessions');
    expect(rows[0].future).toBe(true);
  });

  it('0002 revokes PUBLIC and forces RLS on candidates', async () => {
    const sql = await readFile('migrations/0002_cc02a_command_center.sql', 'utf8');
    expect(sql).toMatch(/REVOKE ALL ON candidates FROM PUBLIC/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it('shows unconsented urgent visitor handoffs on the staff queue', async () => {
    await q(`INSERT INTO candidate_handoffs(candidate_id,reason,urgency,state,consented,program,visitor_identity) VALUES(NULL,'urgent','urgent','open',false,'recruit','deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')`);
    const leaderQueue = await listHandoffs(tag(state.db), leader, {});
    const adminQueue = await listHandoffs(tag(state.db), admin, {});
    expect(leaderQueue).toHaveLength(1);
    expect(adminQueue).toHaveLength(1);
    expect(leaderQueue[0]).toMatchObject({
      candidate_id: null,
      name: 'Unconsented visitor',
      reason: 'urgent',
      consented: false,
      program: 'recruit',
      visitor_identity: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    expect(leaderQueue[0].created_at).toBeTruthy();
    expect(JSON.stringify(leaderQueue[0])).not.toMatch(/@|suicide|kill myself|phone/i);
  });

  it('lists each candidate once when multiple handoffs exist', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Dup','dup@example.test','',0,'new_lead')`, [id]);
    await q(`INSERT INTO candidate_handoffs(candidate_id,reason,state) VALUES($1,'leader_requested','open'),($1,'unapproved_or_unknown','open')`, [id]);
    const rows = await listCandidates(tag(state.db), admin, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0]).not.toHaveProperty('email');
  });

  it('dashboard counts distinct candidate ids, not joined handoff rows', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Count','count@example.test','',0,'new_lead')`, [id]);
    await q(`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES($1,'candidate.created','gia','{}')`, [id]);
    await q(`INSERT INTO candidate_handoffs(candidate_id,reason) VALUES($1,'leader_requested'),($1,'documents')`, [id]);
    const dash = await dashboardCounts(tag(state.db), admin, {});
    expect(dash.newLeads).toBe(1);
  });

  it('preserves due_at when the client omits it on an unrelated save', async () => {
    const id = randomUUID();
    const due = new Date(Date.now() + 864e5).toISOString();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader,due_at) VALUES($1,'Synthetic Due','due@example.test','',0,'contacted',$2,$3)`, [id, leader.email, due]);
    await saveFollowUp(tag(state.db), admin, {
      id,
      stage: 'contacted',
      assignedLeader: leader.email,
      nextAction: 'Ping after FEP',
      dueAtProvided: false,
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    const [row] = await q('SELECT due_at FROM candidates WHERE id=$1', [id]);
    expect(Math.floor(new Date(String(row.due_at)).getTime() / 1000)).toBe(Math.floor(new Date(due).getTime() / 1000));
  });

  it('rejects opt_out as an ordinary PATCH stage', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Stage','s@example.test','',0,'new_lead')`, [id]);
    expect(WRITABLE_STAGES.includes('opt_out' as never)).toBe(false);
    await expect(saveFollowUp(tag(state.db), admin, parseFollowUpBody({
      id, stage: 'opt_out', nextAction: 'x', resolution: '', generalAnswer: '',
    }))).rejects.toThrow('invalid');
    expect((await q('SELECT stage FROM candidates WHERE id=$1', [id]))[0].stage).toBe('new_lead');
  });

  it('STOP cannot be undone via ordinary stage change and cancels acknowledged handoffs', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader,next_action,due_at) VALUES($1,'Synthetic Stop','stop@example.test','',0,'contacted',$2,'follow',now())`, [id, leader.email]);
    await q(`INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES('gia_web_session','sess-stop',$1)`, [id]);
    await q(`INSERT INTO candidate_handoffs(candidate_id,reason,state) VALUES($1,'leader_requested','acknowledged'),($1,'documents','open')`, [id]);
    await stopCandidate(sql, admin, id);
    const [c] = await q('SELECT stage,next_action,due_at FROM candidates WHERE id=$1', [id]);
    expect(c.stage).toBe(STOP_STAGE);
    expect(c.next_action).toBeNull();
    expect(c.due_at).toBeNull();
    const handoffs = await q('SELECT state FROM candidate_handoffs WHERE candidate_id=$1', [id]);
    expect(handoffs.every((h) => h.state === 'cancelled')).toBe(true);
    await expect(saveFollowUp(sql, admin, {
      id,
      stage: 'contacted',
      assignedLeader: leader.email,
      nextAction: 'try to reopen',
      dueAtProvided: true,
      dueAt: new Date().toISOString(),
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    })).rejects.toThrow(/suppressed/);
    expect((await q('SELECT stage FROM candidates WHERE id=$1', [id]))[0].stage).toBe(STOP_STAGE);
  });

  it('database trigger blocks reactivation even if application checks are skipped', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Trigger','t@example.test','',0,'opt_out')`, [id]);
    await expect(state.db.exec(`UPDATE candidates SET stage='contacted' WHERE id='${id}'`)).rejects.toThrow(/suppressed/);
  });

  it('leaders only see and update assigned candidates', async () => {
    const mine = randomUUID();
    const other = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Mine','m@example.test','',0,'new_lead',$3),($2,'Other','o@example.test','',0,'new_lead',$4)`, [mine, other, leader.email, admin.email]);
    const rows = await listCandidates(tag(state.db), leader, {});
    expect(rows.map((r) => r.name)).toEqual(['Mine']);
    await expect(saveFollowUp(tag(state.db), leader, {
      id: other,
      stage: 'contacted',
      assignedLeader: admin.email,
      nextAction: 'nope',
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    })).rejects.toThrow(/forbidden/);
  });

  it('lets a leader save follow-up when assignment is omitted from the form', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Leader Save','ls@example.test','',0,'fep_booked',$2)`, [id, leader.email]);
    await saveFollowUp(sql, leader, {
      id,
      stage: 'fep_attended',
      assignedLeader: null,
      nextAction: 'Send iRecruit link',
      dueAtProvided: true,
      dueAt: new Date(Date.now() + 864e5).toISOString(),
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    const [row] = await q('SELECT stage,assigned_leader FROM candidates WHERE id=$1', [id]);
    expect(row.stage).toBe('fep_attended');
    expect(row.assigned_leader).toBe(leader.email);
  });

  it('records FEP attendance and next-action audit events used by the dashboard', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic FEP','fep@example.test','',0,'fep_booked',$2)`, [id, leader.email]);
    await q(`INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES('gia_web_session','sess-fep',$1)`, [id]);
    await q(`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES($1,'candidate.created','gia','{}'),($1,'fep.booked','gia','{}')`, [id]);
    await saveFollowUp(sql, leader, {
      id,
      stage: 'fep_attended',
      assignedLeader: leader.email,
      nextAction: 'Send iRecruit link',
      dueAtProvided: true,
      dueAt: new Date(Date.now() + 864e5).toISOString(),
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    const kinds = (await q('SELECT kind FROM candidate_events WHERE candidate_id=$1 ORDER BY kind', [id])).map((r) => r.kind);
    expect(kinds).toContain('fep.attended');
    expect(kinds).toContain('stage.changed');
    expect(kinds).toContain('followup.updated');
    const dash = await dashboardCounts(sql, admin, {});
    expect(dash.fepBooked).toBe(1);
    expect(dash.fepAttended).toBe(1);
  });

  it('filters dashboard and queue by source and leader', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'A','a@example.test','',0,'new_lead',$3),($2,'B','b@example.test','',0,'new_lead',$4)`, [a, b, leader.email, admin.email]);
    await q(`INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES('gia_web_session','a',$1),('manual','b',$2)`, [a, b]);
    await q(`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES($1,'candidate.created','gia','{}'),($2,'candidate.created','gia','{}')`, [a, b]);
    const sql = tag(state.db);
    expect((await listCandidates(sql, admin, { source: 'manual' })).map((r) => r.name)).toEqual(['B']);
    expect((await dashboardCounts(sql, admin, { leader: leader.email })).newLeads).toBe(1);
  });

  it('counts current unassigned and overdue outside the event date window', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,due_at,created_at) VALUES($1,'Old Unassigned','old@example.test','',0,'new_lead', now() - interval '1 day', now() - interval '60 days')`, [id]);
    const dash = await dashboardCounts(tag(state.db), admin, { from: manilaDaysAgo(7), to: manilaToday() });
    expect(dash.unassigned).toBe(1);
    expect(dash.overdueFollowups).toBe(1);
    expect(dash.newLeads).toBe(0);
  });

  it('does not mix isolated DNA-quiz rows into the command queue', async () => {
    await q(`INSERT INTO landing_quiz_results(name,email,phone,score) VALUES('Quiz Person','quiz@example.test','+10000000000',80)`);
    expect(await listCandidates(tag(state.db), admin, {})).toHaveLength(0);
    expect((await dashboardCounts(tag(state.db), admin, {})).newLeads).toBe(0);
  });

  it('assertWritable refuses STOP records', () => {
    expect(isStopped({ stage: 'opt_out' })).toBe(true);
    expect(() => assertWritable({ stage: 'opt_out' })).toThrow('suppressed');
    expect(() => assertWritable({ stage: 'contacted' })).not.toThrow();
  });

  it('applyCandidateStop is idempotent on events', async () => {
    const id = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Idempotent','i@example.test','',0,'new_lead')`, [id]);
    const sql = tag(state.db);
    await sql.begin(async (tx: Sql) => {
      await applyCandidateStop(tx, { candidateId: id, actor: 'gia', currentStage: 'new_lead' });
      await applyCandidateStop(tx, { candidateId: id, actor: 'gia', currentStage: 'opt_out' });
    });
    expect(await q("SELECT * FROM candidate_events WHERE kind='opt_out' AND candidate_id=$1", [id])).toHaveLength(1);
  });

  it('records a preliminary evaluation without changing stage or granting access', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Eval','eval@example.test','',0,'new_lead',$2)`, [id, leader.email]);
    await recordEvaluation(sql, leader, { id, suggestedNextStep: 'fep', note: 'Suggest FEP after intro' });
    const [row] = await q('SELECT stage,evaluation_next_step,evaluated_by,literacy_status FROM candidates WHERE id=$1', [id]);
    expect(row.stage).toBe('new_lead');
    expect(row.evaluation_next_step).toBe('fep');
    expect(row.evaluated_by).toBe(leader.email);
    expect(row.literacy_status).toBe('not_started');
    const events = await q("SELECT kind, metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind='evaluation.recorded'", [id]);
    expect(events).toHaveLength(1);
    expect(String(events[0].m)).toMatch(/fep/);
    expect(String(events[0].m)).toMatch(/stageUnchanged/);
    const dash = await dashboardCounts(sql, admin, {});
    expect(dash.evaluated).toBe(1);
    expect(dash.engaged).toBe(0);
    expect(dash.awaitingEvaluation).toBe(0);
  });

  it('counts distinct engaged people from follow-up outcomes and ignores saves without an outcome', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Engage','eng@example.test','',0,'contacted',$2)`, [id, leader.email]);
    await saveFollowUp(sql, leader, {
      id,
      stage: 'contacted',
      assignedLeader: leader.email,
      nextAction: 'Call again',
      dueAtProvided: false,
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    expect((await dashboardCounts(sql, admin, {})).engaged).toBe(0);
    await saveFollowUp(sql, leader, {
      id,
      stage: 'contacted',
      assignedLeader: leader.email,
      nextAction: 'Call again',
      dueAtProvided: false,
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
      engagementOutcome: 'reached',
    });
    const [row] = await q('SELECT last_engagement_outcome, last_engaged_at FROM candidates WHERE id=$1', [id]);
    expect(row.last_engagement_outcome).toBe('reached');
    expect(row.last_engaged_at).toBeTruthy();
    expect((await dashboardCounts(sql, admin, {})).engaged).toBe(1);
  });

  it('STOP blocks evaluation the same way it blocks follow-up', async () => {
    const id = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Stop Eval','se@example.test','',0,'contacted',$2)`, [id, leader.email]);
    await stopCandidate(sql, admin, id);
    await expect(recordEvaluation(sql, admin, { id, suggestedNextStep: 'literacy' })).rejects.toThrow(/suppressed/);
    expect((await q('SELECT evaluation_next_step FROM candidates WHERE id=$1', [id]))[0].evaluation_next_step).toBeNull();
  });

  it('blocks TRUNCATE on append-only event tables', async () => {
    await expect(state.db.exec('TRUNCATE candidate_events')).rejects.toThrow(/append-only/);
    await expect(state.db.exec('TRUNCATE command_audit_events')).rejects.toThrow(/append-only/);
    await expect(state.db.exec('TRUNCATE candidate_evaluations')).rejects.toThrow(/append-only/);
  });

  it('refuses a leader evaluating or following up an unassigned or other-leader candidate', async () => {
    const unassigned = randomUUID();
    const other = randomUUID();
    const mine = randomUUID();
    const sql = tag(state.db);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Unowned','unowned@example.test','',0,'new_lead')`, [unassigned]);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Other','other@example.test','',0,'new_lead',$2)`, [other, admin.email]);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Mine','mine@example.test','',0,'new_lead',$2)`, [mine, leader.email]);
    const follow = (id: string) => ({
      id,
      stage: 'contacted' as const,
      assignedLeader: leader.email,
      nextAction: 'Call',
      dueAtProvided: false,
      resolution: '',
      generalAnswer: '',
      giaCouldAnswer: false,
      resolve: false,
    });
    await expect(saveFollowUp(sql, leader, follow(unassigned))).rejects.toThrow(/forbidden/);
    await expect(saveFollowUp(sql, leader, follow(other))).rejects.toThrow(/forbidden/);
    await expect(recordEvaluation(sql, leader, { id: unassigned, suggestedNextStep: 'fep' })).rejects.toThrow(/forbidden/);
    await expect(recordEvaluation(sql, leader, { id: other, suggestedNextStep: 'fep' })).rejects.toThrow(/forbidden/);
    expect((await q('SELECT evaluated_at FROM candidates WHERE id=$1', [unassigned]))[0].evaluated_at).toBeNull();
    expect((await q('SELECT evaluated_at FROM candidates WHERE id=$1', [other]))[0].evaluated_at).toBeNull();
    await saveFollowUp(sql, leader, follow(mine));
    await recordEvaluation(sql, leader, { id: mine, suggestedNextStep: 'follow_up' });
    expect((await q('SELECT evaluation_next_step, next_action FROM candidates WHERE id=$1', [mine]))[0].evaluation_next_step).toBe('follow_up');
  });
});

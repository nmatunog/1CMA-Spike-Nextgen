import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../gia/apply-migrations.mjs';
import { captureProspect } from '../recruitment/import';
import { saveFollowUp, type Sql } from '../recruitment/store';
import { loadActiveEvaluationConfig, submitEvaluation } from './index';
import type { StaffActor } from '../recruitment/types';

const ctx = vi.hoisted(() => ({
  actor: null as StaffActor | null,
  db: null as unknown as PGlite,
}));

vi.mock('@/lib/gia/staff', () => ({ staff: async () => ctx.actor }));
vi.mock('postgres', () => ({ default: () => {
  function tag(db: PGlite) {
    const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
      const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
      return (await db.query(text, args)).rows;
    };
    query.json = (v: unknown) => JSON.stringify(v);
    query.begin = (fn: (tx: typeof query) => Promise<unknown>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite)));
    return query;
  }
  return tag(ctx.db);
} }));

process.env.DATABASE_URL = 'postgres://synthetic-aia-registration';
process.env.GIA_PUBLIC_ORIGIN = 'https://pilot.test';
process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({
  'admin@example.test': 'admin',
  'leader@example.test': 'leader',
});

const { POST } = await import('@/app/api/recruitment/command/aia-registration/route');

const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

function aiaReq(body: unknown, origin = 'https://pilot.test') {
  return new Request('https://pilot.test/api/recruitment/command/aia-registration', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('AIA registration staff HTTP', () => {
  beforeAll(async () => {
    ctx.db = new PGlite();
    await ctx.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => ctx.db.exec(sql));
  });
  beforeEach(async () => {
    ctx.actor = null;
    await resetWorkflowTables((sql: string) => ctx.db.exec(sql), WORKFLOW_RESET_TABLES);
  });
  afterAll(async () => { await ctx.db.close(); });

  it('returns 401 when unauthenticated and 403 cross-origin', async () => {
    expect((await POST(aiaReq({ id: 'x', action: 'pending' }))).status).toBe(401);
    ctx.actor = leader;
    const cross = await POST(aiaReq({ id: 'x', action: 'pending' }, 'https://attacker.test'));
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({ error: 'invalid_origin' });
  });

  it('returns 403 and writes nothing when a leader posts to another leader\'s candidate', async () => {
    const sql = tag(ctx.db);
    const captured = await captureProspect(sql, admin, { name: 'Synthetic AIA HTTP', email: 'aia-http@example.test', programInterest: 'ra_spike' });
    await saveFollowUp(sql, admin, {
      id: captured.id, stage: 'fep_attended', assignedLeader: admin.email, nextAction: 'Admin owns',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    const config = await loadActiveEvaluationConfig(sql);
    await submitEvaluation(sql, admin, {
      candidateId: captured.id,
      configId: config.id,
      configVersion: config.version,
      answers: {
        background: 'Synthetic',
        education: 'Synthetic',
        motivation: 'Advisor',
        program_interest: 'ra_spike',
        readiness: 'Evenings',
        outcome: 'proceed',
        recommended_next_action: 'leader_conversation',
      },
    });
    ctx.actor = leader;
    const res = await POST(aiaReq({
      id: captured.id, action: 'confirm_attribution', referralSource: 'Should fail',
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    const rows = await ctx.db.query("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%'", [captured.id]);
    expect(rows.rows).toHaveLength(0);
  });
});

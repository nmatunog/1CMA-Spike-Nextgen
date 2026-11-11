import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../gia/apply-migrations.mjs';
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

process.env.DATABASE_URL = 'postgres://synthetic-engagement';
process.env.GIA_PUBLIC_ORIGIN = 'https://pilot.test';
process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({
  'admin@example.test': 'admin',
  'leader@example.test': 'leader',
});

const { POST } = await import('@/app/api/recruitment/command/engagement/route');

const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };
const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };

async function q(sql: string, params: unknown[] = []) {
  return (await ctx.db.query(sql, params)).rows as Record<string, unknown>[];
}

function engageReq(body: unknown, origin = 'https://pilot.test') {
  return new Request('https://pilot.test/api/recruitment/command/engagement', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('engagement staff HTTP', () => {
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

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(engageReq({ candidateId: randomUUID(), kind: 'fep.attended' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a cross-origin staff post', async () => {
    ctx.actor = leader;
    const res = await POST(engageReq({ candidateId: randomUUID(), kind: 'fep.attended' }, 'https://attacker.test'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invalid_origin' });
  });

  it('returns 403 and writes nothing when a leader posts to an unassigned or other-leader candidate', async () => {
    const unassigned = randomUUID();
    const other = randomUUID();
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage) VALUES($1,'Synthetic Unowned Engage','unowned-e@example.test','',0,'new_lead')`, [unassigned]);
    await q(`INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader) VALUES($1,'Synthetic Other Engage','other-e@example.test','',0,'new_lead',$2)`, [other, admin.email]);
    ctx.actor = leader;
    const unowned = await POST(engageReq({ candidateId: unassigned, kind: 'fep.attended', metadata: { intent: 'literacy' } }));
    expect(unowned.status).toBe(403);
    expect(await unowned.json()).toEqual({ error: 'forbidden' });
    const cross = await POST(engageReq({ candidateId: other, kind: 'gia.conversation', metadata: { intent: 'literacy' } }));
    expect(cross.status).toBe(403);
    expect(await q('SELECT 1 FROM candidate_events WHERE candidate_id=$1 OR candidate_id=$2', [unassigned, other])).toHaveLength(0);
    expect((await q('SELECT last_engaged_at FROM candidates WHERE id=$1', [unassigned]))[0].last_engaged_at).toBeNull();
    expect((await q('SELECT last_engaged_at FROM candidates WHERE id=$1', [other]))[0].last_engaged_at).toBeNull();
  });
});

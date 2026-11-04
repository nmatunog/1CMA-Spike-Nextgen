import { it, expect, vi, beforeEach } from 'vitest';
const ctx = vi.hoisted(() => ({ actor: null as null | {email:string;role:string}, calls: 0 }));
vi.mock('@/lib/gia/staff', () => ({ staff: async () => ctx.actor }));
vi.mock('@/lib/gia/repository', () => ({ sql: () => { ctx.calls++; throw new Error('database_must_not_be_reached'); } }));
import { GET, PATCH } from '@/app/api/recruitment/command/route';
import { GET as legacyGET } from '@/app/api/admin/candidates/route';
import { DELETE as legacyDELETE } from '@/app/api/admin/candidates/[id]/route';
beforeEach(() => { ctx.actor=null;ctx.calls=0; });
it('rejects anonymous reads before touching candidate data', async () => { expect((await GET()).status).toBe(401); expect(ctx.calls).toBe(0); });
it('rejects anonymous updates with forged legacy admin cookie', async () => {
  const req=new Request('https://pilot.test/api/recruitment/command',{method:'PATCH',headers:{cookie:'admin_verified=1'},body:'{}'});
  expect((await PATCH(req)).status).toBe(401); expect(ctx.calls).toBe(0);
});
it('blocks legacy candidate reads and deletes without server staff identity', async () => {
  expect((await legacyGET()).status).toBe(401);
  expect((await legacyDELETE(new Request('https://pilot.test',{headers:{cookie:'admin_verified=1'}}),{params:Promise.resolve({id:'fake'})})).status).toBe(401);
});
it('blocks leaders from the legacy all-candidate endpoint', async () => { ctx.actor={email:'leader@example.test',role:'leader'};expect((await legacyGET()).status).toBe(401); });
it('blocks cross-origin staff updates before touching records', async () => {
  ctx.actor={email:'admin@example.test',role:'admin'};
  const req=new Request('https://pilot.test/api/recruitment/command',{method:'PATCH',headers:{origin:'https://attacker.test'},body:'{}'});
  expect((await PATCH(req)).status).toBe(403);expect(ctx.calls).toBe(0);
});

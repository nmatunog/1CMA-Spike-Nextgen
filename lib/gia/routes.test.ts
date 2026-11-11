import { it, expect, vi, beforeEach } from 'vitest';
const ctx = vi.hoisted(() => ({ actor: null as null | {email:string;role:string}, calls: 0 }));
vi.mock('@/lib/gia/staff', () => ({ staff: async () => ctx.actor }));
vi.mock('@/lib/gia/repository', () => ({ sql: () => { ctx.calls++; throw new Error('database_must_not_be_reached'); } }));
vi.mock('@/lib/db/client', () => ({ getDb: () => { throw new Error('database_must_not_be_reached'); } }));
import { GET, PATCH } from '@/app/api/recruitment/command/route';
import { POST as STOP } from '@/app/api/recruitment/command/stop/route';
import { GET as legacyGET } from '@/app/api/admin/candidates/route';
import { DELETE as legacyDELETE } from '@/app/api/admin/candidates/[id]/route';
import { POST as quizPOST } from '@/app/api/candidates/route';
import { POST as IMPORT } from '@/app/api/recruitment/command/import/route';
import { POST as EXPORT } from '@/app/api/recruitment/command/export/route';
import { POST as INTAKE } from '@/app/api/recruitment/command/intake/route';
beforeEach(() => { ctx.actor=null;ctx.calls=0; });
it('rejects anonymous reads before touching candidate data', async () => {
  expect((await GET(new Request('https://pilot.test/api/recruitment/command'))).status).toBe(401);
  expect(ctx.calls).toBe(0);
});
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
it('blocks cross-origin STOP before touching records', async () => {
  ctx.actor={email:'admin@example.test',role:'admin'};
  const req=new Request('https://pilot.test/api/recruitment/command/stop',{method:'POST',headers:{origin:'https://attacker.test'},body:'{"id":"00000000-0000-4000-8000-000000000000"}'});
  expect((await STOP(req)).status).toBe(403);expect(ctx.calls).toBe(0);
});
it('blocks cross-origin admin deletes before touching records', async () => {
  ctx.actor={email:'admin@example.test',role:'admin'};
  const req=new Request('https://pilot.test/api/admin/candidates/fake',{method:'DELETE',headers:{origin:'https://attacker.test'}});
  expect((await legacyDELETE(req,{params:Promise.resolve({id:'fake'})})).status).toBe(403);
});
it('rejects unauthenticated STOP', async () => {
  expect((await STOP(new Request('https://pilot.test/api/recruitment/command/stop',{method:'POST',body:'{}'}))).status).toBe(401);
  expect(ctx.calls).toBe(0);
});
it('rejects cross-origin public quiz posts before writing', async () => {
  const req=new Request('https://pilot.test/api/candidates',{method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json'},body:JSON.stringify({name:'Synthetic Quiz',email:'quiz@example.test',phone:'+10000000000',score:80})});
  expect((await quizPOST(req)).status).toBe(403);
});
it('does not return raw database errors from public quiz POST', async () => {
  const req=new Request('https://pilot.test/api/candidates',{method:'POST',headers:{origin:'https://pilot.test','content-type':'application/json'},body:JSON.stringify({name:'Synthetic Quiz',email:'quiz@example.test',phone:'+10000000000',score:80})});
  const res=await quizPOST(req);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({error:'service_unavailable'});
});
it('blocks unauthenticated and leader CSV import before touching records', async () => {
  expect((await IMPORT(new Request('https://pilot.test/api/recruitment/command/import',{method:'POST',body:'{}'}))).status).toBe(401);
  ctx.actor={email:'leader@example.test',role:'leader'};
  expect((await IMPORT(new Request('https://pilot.test/api/recruitment/command/import',{method:'POST',headers:{origin:'https://pilot.test'},body:'{}'}))).status).toBe(403);
  expect(ctx.calls).toBe(0);
});
it('blocks cross-origin CSV export', async () => {
  ctx.actor={email:'admin@example.test',role:'admin'};
  const req=new Request('https://pilot.test/api/recruitment/command/export',{method:'POST',headers:{origin:'https://attacker.test'},body:'{}'});
  expect((await EXPORT(req)).status).toBe(403);expect(ctx.calls).toBe(0);
});
it('returns allowlisted intake errors instead of raw Error.message', async () => {
  ctx.actor={email:'admin@example.test',role:'admin'};
  const malformed=new Request('https://pilot.test/api/recruitment/command/intake',{method:'POST',headers:{origin:'https://pilot.test'},body:'{'});
  const malformedRes=await INTAKE(malformed);
  expect(malformedRes.status).toBe(400);
  expect(await malformedRes.json()).toEqual({error:'invalid'});
  const dbFail=new Request('https://pilot.test/api/recruitment/command/intake',{method:'POST',headers:{origin:'https://pilot.test','content-type':'application/json'},body:JSON.stringify({name:'Synthetic Intake',email:'intake@example.test'})});
  const dbRes=await INTAKE(dbFail);
  expect(dbRes.status).toBe(400);
  expect(await dbRes.json()).toEqual({error:'invalid'});
});

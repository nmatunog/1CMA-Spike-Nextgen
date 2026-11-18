import {afterAll,beforeAll,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {applyAllMigrations} from '@/lib/gia/apply-migrations.mjs';
import {SCOPE_SQL,type Row,type MemberScope} from './db';
import {hostedProbes} from '../../tests/gia/hosted-sql-probes.mjs';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec("CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',score integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now())");
 await applyAllMigrations((s:string)=>db.exec(s));
});
afterAll(async()=>db.close());
it('server-held proof and scoped data survive shared SQL probes (real LOGIN companion covers RESET ROLE)',async()=>{
 const owner=async(s:string,args:unknown[]=[]) => (await db.query<Row>(s,args)).rows;
 const asMember=async(identity:MemberScope,work:(q:typeof owner)=>Promise<unknown>)=>{try{return await db.transaction(async tx=>{
  await tx.query(SCOPE_SQL,[identity.email||'',identity.accountId||'',identity.candidateId||'',identity.handoffKey||'']);
  await tx.exec('SET LOCAL ROLE member_app');
  return work(async(s,args=[]) => (await tx.query<Row>(s,args)).rows);
 });} finally {await db.exec('RESET SESSION AUTHORIZATION; RESET ROLE');}};
 const report=await hostedProbes(owner,asMember,{resetRole:false});expect(report).toHaveLength(18);
});

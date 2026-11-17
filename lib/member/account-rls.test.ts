import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '@/lib/gia/apply-migrations.mjs';
import { SCOPE_SQL, type MemberScope, type Row } from './db';

let db: PGlite;
const candidates = [1,2,3,4].map(n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
const accounts = [1,2,3,4].map(n => `20000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
const scope = (index: number): MemberScope => ({ email:`member${index+1}@example.test`,candidateId:candidates[index],accountId:accounts[index] });
type Query = (text: string, args?: unknown[]) => Promise<Row[]>;
async function asMember<T>(identity: MemberScope, work: (query: Query) => Promise<T>) {
  return db.transaction(async tx => {
    // Same trust boundary as runtime: bind the request before dropping privileges.
    await tx.query(SCOPE_SQL,[identity.email || '',identity.accountId || '',identity.candidateId || '']);
    await tx.exec('SET LOCAL ROLE member_app');
    return work(async (text,args=[]) => (await tx.query<Row>(text,args)).rows);
  });
}
beforeAll(async () => {
  db=new PGlite();
  await db.exec("CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',score integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());");
  await applyAllMigrations((text:string)=>db.exec(text));
});
afterAll(async()=>db.close());
beforeEach(async()=>{
  await resetWorkflowTables((text:string)=>db.exec(text),WORKFLOW_RESET_TABLES);
  for (let i=0;i<4;i++) await db.query<Row>("INSERT INTO candidates(id,name,email,email_verified,capture_channel) VALUES($1,'Synthetic Member',$2,true,'versa_stub')",[candidates[i],`member${i+1}@example.test`]);
  for (let i=0;i<3;i++) await db.query<Row>('INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,$3)',[accounts[i],candidates[i],['pending','disabled','active'][i]]);
});
it('denies every account and candidate read when no request identity is bound',async()=>{
  expect(await asMember({},q=>q('SELECT id,status FROM user_accounts'))).toEqual([]);
  expect(await asMember({},q=>q('SELECT id,email_normalized FROM candidates'))).toEqual([]);
});
it('an unfiltered SELECT returns only the owned account, never every account or another id',async()=>{
  expect(await asMember(scope(0),q=>q('SELECT id,candidate_id,status FROM user_accounts'))).toEqual([{id:accounts[0],candidate_id:candidates[0],status:'pending'}]);
  expect(await asMember(scope(0),q=>q('SELECT id,status FROM user_accounts WHERE id=$1',[accounts[1]]))).toEqual([]);
});
it('cannot reactivate a disabled account even when its id is the bound request id',async()=>{
  expect(await asMember(scope(1),q=>q("UPDATE user_accounts SET status='active' WHERE id=$1 RETURNING id",[accounts[1]]))).toEqual([]);
  expect((await db.query<Row>('SELECT status FROM user_accounts WHERE id=$1',[accounts[1]])).rows[0].status).toBe('disabled');
});
it('cannot insert an already-active account even with matching request ids and verified email',async()=>{
  await expect(asMember(scope(3),q=>q("INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'active')",[accounts[3],candidates[3]]))).rejects.toThrow(/row-level security/);
});
it('can insert only its pending row and activate exactly that pending row',async()=>{
  await asMember(scope(3),async q=>{
    expect(await q("INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'pending') ON CONFLICT(candidate_id) DO NOTHING RETURNING id",[accounts[3],candidates[3]])).toEqual([{id:accounts[3]}]);
    expect(await q("UPDATE user_accounts SET status='active' WHERE id=$1 RETURNING id",[accounts[3]])).toEqual([{id:accounts[3]}]);
    expect(await q("UPDATE user_accounts SET status='pending' WHERE id=$1 RETURNING id",[accounts[3]])).toEqual([]);
  });
});
it('cannot activate another pending account or disable its own pending account',async()=>{
  expect(await asMember(scope(2),q=>q("UPDATE user_accounts SET status='active' WHERE id=$1 RETURNING id",[accounts[0]]))).toEqual([]);
  await expect(asMember(scope(0),q=>q("UPDATE user_accounts SET status='disabled' WHERE id=$1",[accounts[0]]))).rejects.toThrow(/row-level security/);
});
it('has no DELETE privilege for either its own row or the entire account table',async()=>{
  await expect(asMember(scope(0),q=>q('DELETE FROM user_accounts WHERE id=$1',[accounts[0]]))).rejects.toThrow(/permission denied/);
  await expect(asMember(scope(0),q=>q('DELETE FROM user_accounts'))).rejects.toThrow(/permission denied/);
});
it('cannot reassign candidate_id or read unused created_at columns',async()=>{
  await expect(asMember(scope(0),q=>q('UPDATE user_accounts SET candidate_id=$1 WHERE id=$2',[candidates[3],accounts[0]]))).rejects.toThrow(/permission denied/);
  await expect(asMember(scope(0),q=>q('SELECT created_at FROM user_accounts'))).rejects.toThrow(/permission denied/);
});
it('candidate reads are limited to the verified email on this request',async()=>{
  expect(await asMember(scope(0),q=>q('SELECT id,email_normalized FROM candidates'))).toEqual([{id:candidates[0],email_normalized:'member1@example.test'}]);
  expect(await asMember(scope(0),q=>q('SELECT id FROM candidates WHERE id=$1',[candidates[1]]))).toEqual([]);
  await db.query<Row>('UPDATE candidates SET email_verified=false WHERE id=$1',[candidates[0]]);
  expect(await asMember(scope(0),q=>q('SELECT id FROM candidates'))).toEqual([]);
});
it('rejects inserts for another account id, candidate id or email',async()=>{
  for (const identity of [{...scope(3),accountId:accounts[0]},{...scope(3),candidateId:candidates[0]},{...scope(3),email:'member1@example.test'}]) {
    await expect(asMember(identity,q=>q("INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'pending')",[accounts[3],candidates[3]]))).rejects.toThrow(/row-level security/);
  }
});
it('does not retain a prior request scope on another transaction',async()=>{
  expect(await asMember(scope(0),q=>q('SELECT id FROM user_accounts'))).toHaveLength(1);
  expect(await asMember({},q=>q('SELECT id FROM user_accounts'))).toHaveLength(0);
  expect(await asMember(scope(2),q=>q('SELECT id FROM user_accounts'))).toEqual([{id:accounts[2]}]);
});
it('runs the probes with FORCE RLS and no candidate-id UPDATE or DELETE grant',async()=>{
  const rows=(await db.query<Row>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('candidates','user_accounts')")).rows;
  expect(rows).toHaveLength(2); expect(rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  const [priv]=(await db.query<Row>("SELECT has_table_privilege('member_app','user_accounts','DELETE') AS deletes,has_column_privilege('member_app','user_accounts','candidate_id','UPDATE') AS reassigns")).rows;
  expect(priv).toEqual({deletes:false,reassigns:false});
});

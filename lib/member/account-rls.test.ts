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
  await db.exec('CREATE ROLE member_local_probe LOGIN NOSUPERUSER NOBYPASSRLS; GRANT member_app TO member_local_probe');
});
afterAll(async()=>db.close());
beforeEach(async()=>{
  await resetWorkflowTables((text:string)=>db.exec(text),WORKFLOW_RESET_TABLES);
  for (let i=0;i<4;i++) await db.query<Row>("INSERT INTO candidates(id,name,email,email_verified,capture_channel) VALUES($1,'Synthetic Member',$2,true,'versa_stub')",[candidates[i],`member${i+1}@example.test`]);
  for (let i=0;i<3;i++) {
    await db.query<Row>('INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,$3)',[accounts[i],candidates[i],['pending','disabled','active'][i]]);
    await db.query('INSERT INTO member_credentials(account_id,email,password_salt,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[accounts[i],scope(i).email,'0'.repeat(32),'0'.repeat(128)]);
    await db.query("INSERT INTO member_challenges(token_hash,kind,account_id,expires_at) VALUES($1,'reset',$2,now()+interval '10 minutes')",['a'.repeat(63)+i,accounts[i]]);
  }
  await db.query("INSERT INTO member_challenges(token_hash,kind,pending_email,expires_at) VALUES($1,'verify',$2,now()+interval '10 minutes')",['b'.repeat(64),scope(3).email]);
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
  await expect(asMember(scope(1),q=>q("UPDATE user_accounts SET status='active' WHERE id=$1 RETURNING id",[accounts[1]]))).rejects.toThrow(/permission denied/);
  expect(await asMember(scope(1),q=>q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[1],candidates[1]]))).toEqual([{activated:false}]);
  expect((await db.query<Row>('SELECT status FROM user_accounts WHERE id=$1',[accounts[1]])).rows[0].status).toBe('disabled');
});
it('cannot insert an already-active account even with matching request ids and verified email',async()=>{
  await expect(asMember(scope(3),q=>q("INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'active')",[accounts[3],candidates[3]]))).rejects.toThrow(/permission denied/);
});
it('can insert only its pending row and activate exactly that pending row',async()=>{
  await asMember(scope(3),async q=>{
    expect(await q('SELECT public.member_create_pending_account($1,$2,$3) AS id',[accounts[3],candidates[3],scope(3).email])).toEqual([{id:accounts[3]}]);
    expect(await q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[3],candidates[3]])).toEqual([{activated:true}]);
    expect(await q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[3],candidates[3]])).toEqual([{activated:false}]);
  });
});
it('cannot activate another pending account or disable its own pending account',async()=>{
  expect(await asMember(scope(2),q=>q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[0],candidates[2]]))).toEqual([{activated:false}]);
  await expect(asMember(scope(0),q=>q("UPDATE user_accounts SET status='disabled' WHERE id=$1",[accounts[0]]))).rejects.toThrow(/permission denied/);
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
    await expect(asMember(identity,q=>q("INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'pending')",[accounts[3],candidates[3]]))).rejects.toThrow(/permission denied/);
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

it('scope tampering never restores direct account INSERT or UPDATE permission',async()=>{
  for (const statement of ["INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,'pending')", "UPDATE user_accounts SET status='active' WHERE id=$1 AND candidate_id=$2"]) {
    await expect(asMember(scope(0),async q=>{
      await q(SCOPE_SQL,[scope(3).email,accounts[3],candidates[3]]);
      return q(statement,[accounts[3],candidates[3]]);
    })).rejects.toThrow(/permission denied/);
  }
});
it('definer create rejects an unverified candidate and mismatching email or ids',async()=>{
  await db.query('UPDATE candidates SET email_verified=false WHERE id=$1',[candidates[3]]);
  expect(await asMember(scope(3),q=>q('SELECT public.member_create_pending_account($1,$2,$3) AS id',[accounts[3],candidates[3],scope(3).email]))).toEqual([{id:null}]);
  await db.query('UPDATE candidates SET email_verified=true WHERE id=$1',[candidates[3]]);
  for (const args of [[accounts[3],candidates[3],'other@example.test'],[accounts[3],candidates[0],scope(3).email],[accounts[0],candidates[3],scope(3).email]]) {
    expect(await asMember(scope(3),q=>q('SELECT public.member_create_pending_account($1,$2,$3) AS id',args))).toEqual([{id:null}]);
  }
  expect(await asMember({...scope(3),email:'other@example.test'},q=>q('SELECT public.member_create_pending_account($1,$2,$3) AS id',[accounts[3],candidates[3],'other@example.test']))).toEqual([{id:null}]);
});
it('definers leave disabled and active accounts unchanged and reject another candidate id',async()=>{
  for (const i of [1,2]) {
    expect(await asMember(scope(i),q=>q('SELECT public.member_create_pending_account($1,$2,$3) AS id',[accounts[i],candidates[i],scope(i).email]))).toEqual([{id:null}]);
    expect(await asMember(scope(i),q=>q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[i],candidates[i]]))).toEqual([{activated:false}]);
  }
  expect(await asMember(scope(0),q=>q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[0],candidates[1]]))).toEqual([{activated:false}]);
  expect(await asMember({...scope(1),accountId:accounts[0]},q=>q('SELECT public.member_activate_account($1,$2) AS activated',[accounts[0],candidates[1]]))).toEqual([{activated:false}]);
});
it('credentials and challenges are unreadable without scope and show only the scoped identity',async()=>{
  for (const table of ['member_credentials','member_challenges']) {
    expect(await asMember({},q=>q(`SELECT * FROM ${table}`))).toEqual([]);
    const owned=await asMember(scope(0),q=>q(`SELECT * FROM ${table}`));
    expect(owned).toHaveLength(1); expect(owned[0].account_id).toBe(accounts[0]);
    expect(await asMember({email:scope(0).email},q=>q('SELECT email FROM member_credentials'))).toEqual([{email:scope(0).email}]);
  }
  expect(await asMember({email:scope(3).email},q=>q('SELECT pending_email FROM member_challenges'))).toEqual([{pending_email:scope(3).email}]);
});
it('token-only lookup returns one exact challenge and never enumerates or accepts a wrong kind',async()=>{
  expect(await asMember({},q=>q("SELECT * FROM public.member_lookup_challenge($1,'reset')",['a'.repeat(63)+'0']))).toHaveLength(1);
  for (const [hash,kind] of [['a'.repeat(63)+'0','verify'],['%','reset'],['c'.repeat(64),'reset'],['a'.repeat(63)+'0','other']]) {
    expect(await asMember({},q=>q('SELECT * FROM public.member_lookup_challenge($1,$2)',[hash,kind]))).toEqual([]);
  }
});
it('all definer functions have a fixed search_path and the migration owner',async()=>{
  const rows=(await db.query<Row>("SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner)=current_user AS owned FROM pg_proc p WHERE p.proname IN ('member_create_pending_account','member_activate_account','member_lookup_challenge')")).rows;
  expect(rows).toHaveLength(3); for(const row of rows) { expect(row.prosecdef).toBe(true); expect(row.owned).toBe(true); expect(row.proconfig).toContain('search_path=pg_catalog, public'); }
});
it('gia_app, anon and authenticated cannot read any member table or execute the functions',async()=>{
  const tables=(await db.query<Row>("SELECT relname FROM pg_class WHERE relname LIKE 'member_%' AND relkind='r'")).rows;
  for (const role of ['gia_app','anon','authenticated']) {
    const denied=async(text:string)=>db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);return tx.query(text);});
    for(const table of tables) await expect(denied(`SELECT * FROM public.${table.relname}`)).rejects.toThrow(/permission denied/);
    for(const call of ["member_create_pending_account(NULL,NULL,NULL)","member_activate_account(NULL,NULL)","member_lookup_challenge(NULL,NULL)"]) await expect(denied(`SELECT * FROM public.${call}`)).rejects.toThrow(/permission denied/);
  }
});
it('RESET ROLE gains no owner privileges with a dedicated non-owner login (local fixture only)',async()=>{
  for(const statement of ["INSERT INTO user_accounts DEFAULT VALUES","UPDATE user_accounts SET status='active'","DELETE FROM user_accounts"]) {
    await expect(db.transaction(async tx=>{
      await tx.exec('SET LOCAL SESSION AUTHORIZATION member_local_probe; SET LOCAL ROLE member_app; RESET ROLE');
      expect((await tx.query<Row>('SELECT current_user AS actor')).rows[0].actor).toBe('member_local_probe');
      return tx.query(statement);
    })).rejects.toThrow(/permission denied/);
  }
});

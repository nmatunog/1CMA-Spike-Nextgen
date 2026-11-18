// Shared synthetic assertions for PGlite and a real restricted PostgreSQL login.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
export const TEST_PROOF_KEY='ab'.repeat(32);
export function proof(action,claims,key=TEST_PROOF_KEY,exp=Date.now()+60000) {
 const message=JSON.stringify({action,...claims,exp,nonce:randomBytes(32).toString('hex')});
 return {message,mac:createHmac('sha256',Buffer.from(key,'hex')).update(message).digest('hex')};
}
export async function hostedProbes(owner,asMember,{resetRole=true}={}) {
 const report=[]; const check=async(name,fn)=>{await fn();report.push(name);};
 const c=[1,2,3,4].map(n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
 const a=[1,2,3,4].map(n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
 const h=[1,2,3,4].map(n=>String(n).repeat(64));
 const ctx=i=>({email:`member${i}@example.test`,accountId:a[i],candidateId:c[i],handoffKey:h[i]});
 await owner("INSERT INTO member_private.proof_keys(id,secret) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret",[TEST_PROOF_KEY]);
 for(let i=0;i<4;i++) {
  await owner("INSERT INTO candidates(id,name,email,email_verified,capture_channel) VALUES($1,'Synthetic Member',$2,true,'versa_stub')",[c[i],ctx(i).email]);
  await owner("INSERT INTO member_handoffs(key_hash,payload,verified_at,expires_at) VALUES($1,$2::jsonb,now(),now()+interval '15 minutes')",[h[i],JSON.stringify({me:ctx(i).email,mfn:'Synthetic',mln:'Member'})]);
  await owner("INSERT INTO member_pending_signups(handoff_key,email,password_salt,password_hash,expires_at) VALUES($1,$2,'synthetic','synthetic',now()+interval '15 minutes')",[h[i],ctx(i).email]);
 }
 for(let i=0;i<3;i++) {
  await owner('INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,$3)',[a[i],c[i],['pending','disabled','active'][i]]);
  await owner("INSERT INTO member_credentials(account_id,email,password_salt,password_hash,email_verified_at) VALUES($1,$2,'synthetic','synthetic',now())",[a[i],ctx(i).email]);
  await owner("INSERT INTO member_challenges(token_hash,kind,account_id,expires_at) VALUES($1,'reset',$2,now()+interval '10 minutes')",['b'.repeat(63)+i,a[i]]);
 }
 const createClaims={account:a[3],candidate:c[3],email:ctx(3).email,handoff:h[3]};
 const create=async(p,claims=createClaims)=>asMember(ctx(3),q=>q('SELECT public.member_create_pending_account($1,$2,$3,$4,$5::jsonb) AS id',[claims.account,claims.candidate,claims.email,claims.handoff,JSON.stringify(p)]));
 await check('GUC rebind cannot create or activate without server proof',async()=>{
  for(const reset of resetRole?[false,true]:[false]) await asMember(ctx(0),async q=>{
   if(reset) await q('RESET ROLE');
   await q("SELECT set_config('app.member_email',$1,true),set_config('app.member_account_id',$2,true),set_config('app.member_candidate_id',$3,true),set_config('app.member_handoff_key',$4,true)",[ctx(3).email,a[3],c[3],h[3]]);
   assert.equal((await q("SELECT member_create_pending_account($1,$2,$3,$4,'{}') AS id",[a[3],c[3],ctx(3).email,h[3]]))[0].id,null);
   assert.equal((await q("SELECT member_activate_account($1,$2,$3,'{}') AS ok",[a[0],c[0],h[0]]))[0].ok,false);
  });
  for(const p of [null,{}, {message:'{}'},proof('create_account',createClaims,'cd'.repeat(32))]) assert.equal((await create(p))[0].id,null);
  const activation={account:a[0],candidate:c[0],handoff:h[0]};
  assert.equal((await asMember(ctx(0),q=>q('SELECT public.member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[0],c[0],h[0],JSON.stringify(proof('activate_account',activation,'cd'.repeat(32)))])))[0].ok,false);
 });
 await check('proof claims, operation, expiry and nonce cannot be altered/replayed',async()=>{
  const p=proof('create_account',createClaims);assert.equal((await create({...p,mac:null}))[0].id,null);const claims={...createClaims,email:'victim@example.test'};
  assert.equal((await create(p,claims))[0].id,null);
  assert.equal((await create(proof('activate_account',createClaims)))[0].id,null);
  assert.equal((await create(proof('create_account',createClaims,TEST_PROOF_KEY,Date.now()-1000)))[0].id,null);
 });
 await check('handoff and pending data hidden without scope; other identities hidden with own scope',async()=>{
  for(const table of ['member_handoffs','member_pending_signups']) {
   assert.equal((await asMember({},q=>q(`SELECT * FROM ${table}`))).length,0);
   assert.equal((await asMember(ctx(0),q=>q(`SELECT * FROM ${table}`))).length,1);
   const key=table==='member_handoffs'?'key_hash':'handoff_key';
   assert.equal((await asMember(ctx(0),q=>q(`SELECT * FROM ${table} WHERE ${key}=$1`,[h[1]]))).length,0);
  }
 });
 await check('raw SQL cannot forge verified flag/payload or account writes, even after RESET ROLE',async()=>{
  for(const sql of ["UPDATE member_handoffs SET verified_at=now()","UPDATE member_handoffs SET payload='{}'::jsonb","INSERT INTO member_handoffs(key_hash,payload,expires_at) VALUES('forged','{}',now())","INSERT INTO user_accounts DEFAULT VALUES","UPDATE user_accounts SET status='active'"]) {
   await assert.rejects(asMember(ctx(3),async q=>{if(resetRole) await q('RESET ROLE');return q(sql);}),/permission denied/);
  }
 });
 await check('private HMAC key and authorization helper are inaccessible to the login',async()=>{
  await assert.rejects(asMember({},q=>q('SELECT * FROM member_private.proof_keys')),/permission denied/);
  await assert.rejects(asMember({},q=>q("SELECT member_private.authorize('{}','create_account','{}')")),/permission denied/);
 });
 await check('challenge lookup requires proof even when a token hash is known',async()=>{
  const hash='a'.repeat(64);await owner("INSERT INTO member_challenges(token_hash,kind,pending_email,expires_at) VALUES($1,'verify',$2,now()+interval '10 minutes')",[hash,ctx(0).email]);
  assert.equal((await asMember(ctx(0),q=>q("SELECT * FROM public.member_lookup_challenge($1,'verify','{}')",[hash]))).length,0);
  const p=proof('lookup_challenge',{hash,kind:'verify'});
  assert.equal((await asMember({},q=>q("SELECT * FROM public.member_lookup_challenge($1,'verify',$2::jsonb)",[hash,JSON.stringify(p)]))).length,1);
 });
 await check('valid MAC alone cannot activate an unverified, mismatched or expired handoff',async()=>{
  const claims={account:a[0],candidate:c[0],handoff:h[0]};
  const activate=()=>asMember(ctx(0),q=>q('SELECT member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[0],c[0],h[0],JSON.stringify(proof('activate_account',claims))]));
  await owner('UPDATE member_handoffs SET verified_at=NULL WHERE key_hash=$1',[h[0]]);assert.equal((await activate())[0].ok,false);
  await owner("UPDATE member_handoffs SET verified_at=now(),expires_at=now()-interval '1 second' WHERE key_hash=$1",[h[0]]);assert.equal((await activate())[0].ok,false);
  await owner("UPDATE member_handoffs SET expires_at=now()+interval '15 minutes',payload=jsonb_build_object('me',$2::text) WHERE key_hash=$1",[h[0],ctx(1).email]);assert.equal((await activate())[0].ok,false);
  await owner("UPDATE member_handoffs SET payload=jsonb_build_object('me',$2::text) WHERE key_hash=$1",[h[0],ctx(0).email]);
 });
 await check('verified candidate and email invariants remain mandatory even with valid create proof',async()=>{
  await owner('UPDATE candidates SET email_verified=false WHERE id=$1',[c[3]]);
  assert.equal((await create(proof('create_account',createClaims)))[0].id,null);
  await owner('UPDATE candidates SET email_verified=true WHERE id=$1',[c[3]]);
  for(const claims of [{...createClaims,email:ctx(0).email},{...createClaims,candidate:c[0]}]) assert.equal((await create(proof('create_account',claims),claims))[0].id,null);
 });
 await check('credential and challenge reads retain own-scope isolation and transaction clearing',async()=>{
  for(const table of ['member_credentials','member_challenges']) {
   assert.equal((await asMember({},q=>q(`SELECT * FROM ${table}`))).length,0);
   const rows=await asMember(ctx(0),q=>q(`SELECT * FROM ${table}`));assert.equal(rows.length,table==='member_challenges'?2:1);
   assert(rows.every(row=>row.account_id===a[0] || row.pending_email===ctx(0).email));
   assert.equal((await asMember(ctx(0),q=>q(`SELECT * FROM ${table} WHERE account_id=$1`,[a[1]]))).length,0);
   assert.equal((await asMember({},q=>q(`SELECT * FROM ${table}`))).length,0);
  }
  assert.equal((await asMember({},q=>q('SELECT id FROM candidates'))).length,0);
  assert.equal((await asMember(ctx(0),q=>q('SELECT id FROM candidates'))).length,1);
 });
 await check('definer ownership/search path and FORCE RLS remain enforced',async()=>{
  const funcs=await owner("SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner)=current_user AS owned FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','member_private') AND (p.proname LIKE 'member_%' OR p.proname='authorize')");
  assert(funcs.length>=10);assert(funcs.every(r=>r.prosecdef&&r.owned&&r.proconfig.includes('search_path=pg_catalog, public')));
  const tables=await owner("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('candidates','user_accounts','member_credentials','member_challenges','member_handoffs','member_pending_signups')");
  assert.equal(tables.length,6);assert(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  await assert.rejects(asMember(ctx(0),q=>q('UPDATE user_accounts SET candidate_id=$1 WHERE id=$2',[c[3],a[0]])),/permission denied/);
 });
 await check('valid verified server handoff proof creates pending; replay cannot create again',async()=>{
  const p=proof('create_account',createClaims);assert.equal((await create(p))[0].id,a[3]);assert.equal((await create(p))[0].id,null);
 });
 await check('valid activation proof activates only its exact account/handoff once',async()=>{
  const claims={account:a[3],candidate:c[3],handoff:h[3]},p=proof('activate_account',claims);
  assert.equal((await asMember(ctx(3),q=>q('SELECT public.member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[3],c[3],h[3],JSON.stringify(p)])))[0].ok,true);
  assert.equal((await asMember(ctx(3),q=>q('SELECT public.member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[3],c[3],h[3],JSON.stringify(p)])))[0].ok,false);
 });
 await check('disabled accounts stay disabled even with a valid server capability',async()=>{
  const claims={account:a[1],candidate:c[1],handoff:h[1]};
  assert.equal((await asMember(ctx(1),q=>q('SELECT public.member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[1],c[1],h[1],JSON.stringify(proof('activate_account',claims))])))[0].ok,false);
 });
 await check('legacy unproved definer signatures are no longer callable',async()=>{
  for(const sql of ["SELECT member_create_pending_account(NULL,NULL,NULL)","SELECT member_activate_account(NULL,NULL)","SELECT * FROM member_lookup_challenge(NULL,NULL)"]) await assert.rejects(asMember({},q=>q(sql)),/permission denied/);
 });
 await check('gia_app, anon and authenticated have neither member-table reads nor definer execution',async()=>{
  for(const role of ['gia_app','anon','authenticated']) {
   const tables=await owner("SELECT has_any_column_privilege($1,c.oid,'SELECT') AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'member_%' AND c.relkind='r'",[role]);
   assert(tables.every(r=>!r.allowed));
   const functions=await owner("SELECT has_function_privilege($1,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'member_%'",[role]);
   assert(functions.every(r=>!r.allowed));
  }
 });
 await check('the immutable handoff write entry point rejects unsigned rotation',async()=>{
  const rows=await asMember(ctx(0),q=>q("SELECT member_write_handoff('rotate',$1,'null'::jsonb,$2,NULL,$3,'{}') AS ok",['f'.repeat(64),h[0],Date.now()+900000]));
  assert.equal(rows[0].ok,false);
 });
 await check('owned canonical reads stay scoped and DELETE/reassignment remain denied',async()=>{
  assert.equal((await asMember({},q=>q('SELECT id,status FROM user_accounts'))).length,0);
  assert.equal((await asMember(ctx(0),q=>q('SELECT id,status FROM user_accounts'))).length,1);
  await assert.rejects(asMember(ctx(0),q=>q('SELECT created_at FROM user_accounts')),/permission denied/);
  await assert.rejects(asMember(ctx(0),q=>q('DELETE FROM user_accounts')),/permission denied/);
 });
 await check('an unprovisioned private proof key fails closed even for otherwise valid pending activation',async()=>{
  await owner('DELETE FROM member_private.proof_keys');
  const claims={account:a[0],candidate:c[0],handoff:h[0]};
  assert.equal((await asMember(ctx(0),q=>q('SELECT member_activate_account($1,$2,$3,$4::jsonb) AS ok',[a[0],c[0],h[0],JSON.stringify(proof('activate_account',claims))])))[0].ok,false);
  await owner('INSERT INTO member_private.proof_keys(id,secret) VALUES(true,$1)',[TEST_PROOF_KEY]);
 });
 return report;
}

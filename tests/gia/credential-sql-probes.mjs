import assert from 'node:assert/strict';
// Synthetic-only extension to #28's shared real PostgreSQL/PGlite battery.
export async function credentialProbes(owner,asMember,proof,{resetRole=true}={}) {
 const report=[];
 const account='70000000-0000-0000-0000-000000000001',candidate='60000000-0000-0000-0000-000000000001';
 const freshAccount='70000000-0000-0000-0000-000000000002',freshCandidate='60000000-0000-0000-0000-000000000002';
 const email='proof-victim@example.test',freshEmail='proof-new@example.test';
 const old='9'.repeat(64),next='8'.repeat(64),claimed='7'.repeat(64),token='6'.repeat(64);
 const salt='00'.repeat(16),hash='00'.repeat(64),expires=Date.now()+900000;
 for(const [a,c,e,status] of [[account,candidate,email,'active'],[freshAccount,freshCandidate,freshEmail,'pending']]) {
  await owner("INSERT INTO candidates(id,name,email,email_verified,capture_channel) VALUES($1,'Synthetic Member',$2,true,'versa_stub')",[c,e]);
  await owner('INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,$3)',[a,c,status]);
 }
 await owner('INSERT INTO member_credentials(account_id,email,password_salt,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[account,email,salt,hash]);
 for(const [h,e,a] of [[old,email,null],[next,email,null],[claimed,freshEmail,freshAccount]]) await owner('INSERT INTO member_handoffs(key_hash,payload,verified_at,claimed_by,expires_at) VALUES($1,$2::jsonb,now(),$3,now()+interval \'15 minutes\')',[h,JSON.stringify({me:e,mfn:'Synthetic',mln:'Member'}),a]);
 await owner('INSERT INTO member_pending_signups(handoff_key,email,password_salt,password_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval \'15 minutes\')',[old,email,salt,hash]);
 const scope={email,accountId:account,candidateId:candidate,handoffKey:old};
 for(const reset of resetRole?[false,true]:[false]) {
  for(const sql of [
   "INSERT INTO member_credentials DEFAULT VALUES","UPDATE member_credentials SET password_hash='attacker'",
   "INSERT INTO member_pending_signups DEFAULT VALUES","UPDATE member_pending_signups SET password_hash='attacker'","DELETE FROM member_pending_signups",
   "INSERT INTO member_challenges DEFAULT VALUES","UPDATE member_challenges SET consumed_at=NULL",
  ]) await assert.rejects(asMember({},async q=>{
   if(reset) await q('RESET ROLE');
   await q("SELECT set_config('app.member_email',$1,true),set_config('app.member_account_id',$2,true),set_config('app.member_handoff_key',$3,true)",[email,account,old]);
   return q(sql);
  }),/permission denied/);
 }
 assert.equal((await owner('SELECT password_hash FROM member_credentials WHERE account_id=$1',[account]))[0].password_hash,hash);
 report.push('LOW-A direct credential, pending and challenge DML denied after GUC rebinding and RESET ROLE');
 const descriptors=[
  ['create_credential',{account:freshAccount,email:freshEmail,salt,hash}],
  ['set_password',{account,salt,hash,version:1}],
  ['bump_auth_version',{account,version:2}],
  ['stage_pending',{handoff:old,email,salt,hash,expires}],
  ['rekey_pending',{old,new:next}],
  ['delete_pending',{handoff:next}],
  ['prune_pending',{now:Date.now()}],
  ['create_challenge',{token,kind:'verify',account:null,email,handoff:old,expires}],
  ['prepare_challenge',{token,kind:'verify'}],
  ['consume_challenge',{token,kind:'verify'}],
 ];
 const call=(action,claims,p,reset=false)=>asMember(scope,async q=>{
  if(reset) await q('RESET ROLE');
  const args=[...Object.values(claims),JSON.stringify(p)];
  const params=Object.keys(claims).map((_,i)=>`$${i+1}`).concat(`$${args.length}::jsonb`).join(',');
  return q(`SELECT public.member_${action}(${params}) AS ok`,args);
 });
 for(const [action,claims] of descriptors) {
  const first=Object.keys(claims)[0],value=claims[first];
  const swapped={...claims,[first]:typeof value==='number'?value+1:(value.includes('-')&&first==='account'?'70000000-0000-0000-0000-000000000099':'e'.repeat(64))};
  const valid=proof(action,claims);
  for(const reset of resetRole?[false,true]:[false]) for(const invalid of [null,{},proof(action,claims,'cd'.repeat(32)),proof(action,claims,undefined,Date.now()-1000),proof('wrong_action',claims),proof(action,{...claims,extra:'forbidden'}),proof(action,swapped)]) assert.equal((await call(action,claims,invalid,reset))[0].ok,false,`${action}: invalid proof accepted`);
  assert.equal((await call(action,swapped,valid))[0].ok,false,`${action}: swapped arguments accepted`);
  assert.equal((await call(action,claims,valid,resetRole))[0].ok,true,`${action}: valid proof rejected`);
  for(const reset of resetRole?[false,true]:[false]) assert.equal((await call(action,claims,valid,reset))[0].ok,false,`${action}: replay accepted`);
  report.push(`${action}: no/forged/expired/wrong-action/extra-claim/swapped/replayed proof rejected; valid proof accepted`);
 }
 const createClaims={account:freshAccount,email:freshEmail,salt:'11'.repeat(16),hash:'11'.repeat(64)};
 assert.equal((await call('create_credential',createClaims,proof('create_credential',createClaims)))[0].ok,false);
 assert.equal((await owner('SELECT password_hash FROM member_credentials WHERE account_id=$1',[freshAccount]))[0].password_hash,hash);
 const stale={account,salt,hash:'22'.repeat(64),version:1};
 assert.equal((await call('set_password',stale,proof('set_password',stale)))[0].ok,false);
 assert.equal((await owner('SELECT auth_version FROM member_credentials WHERE account_id=$1',[account]))[0].auth_version,3);
 report.push('credential creation never overwrites; stale auth_version cannot change password');
 return report;
}

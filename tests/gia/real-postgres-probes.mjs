// Throwaway loopback PostgreSQL only; never a hosted database.
import postgres from 'postgres';
import {hostedProbes} from './hosted-sql-probes.mjs';
import {applyAllMigrations} from '../../lib/gia/apply-migrations.mjs';
const admin=postgres('postgres://postgres@127.0.0.1:55432/postgres',{max:1,prepare:false});
const name='member_hardening_sql_probe';
await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);await admin.unsafe(`CREATE DATABASE ${name}`);
const owner=postgres(`postgres://postgres@127.0.0.1:55432/${name}`,{max:1,prepare:false});
await owner.unsafe("CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',score integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now())");
await applyAllMigrations(s=>owner.unsafe(s));
const member=postgres(`postgres://member_runtime@127.0.0.1:55432/${name}`,{max:1,prepare:false});
const query=async(client,s,args=[])=>{
 const positions=new Set([...s.matchAll(/\$(\d+)::jsonb/g)].map(m=>Number(m[1])-1));
 const values=args.map((v,i)=>positions.has(i)?client.json(JSON.parse(v)):v);
 return [...await client.unsafe(s,values)];
};
try {
 const asMember=(identity,work)=>member.begin(async tx=>{
  await tx.unsafe("SELECT set_config('app.member_email',$1,true),set_config('app.member_account_id',$2,true),set_config('app.member_candidate_id',$3,true),set_config('app.member_handoff_key',$4,true)",[identity.email||'',identity.accountId||'',identity.candidateId||'',identity.handoffKey||'']);
  await tx.unsafe('SET LOCAL ROLE member_app');
  return work((s,args=[])=>query(tx,s,args));
 });
 const report=await hostedProbes((s,args=[])=>query(owner,s,args),asMember);
 const [identity]=await member`SELECT session_user,current_user,current_setting('server_version') AS version`;
 console.log(JSON.stringify({identity,passed:report.length,probes:report}));
} finally {await member.end();await owner.end();await admin.unsafe(`DROP DATABASE ${name}`);await admin.end();}

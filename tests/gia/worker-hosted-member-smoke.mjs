// Actual build:cf artifact, local workerd, disposable loopback PostgreSQL only.
// No hosted requests, deployment, Hyperdrive, real users or mail.
import {spawn,spawnSync} from 'node:child_process';
import {request} from 'node:https';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {applyAllMigrations} from '../../lib/gia/apply-migrations.mjs';
const bin=process.env.MEMBER_TEST_PG_BIN;
if(!bin)throw new Error('MEMBER_TEST_PG_BIN must point to disposable local PostgreSQL binaries');
const root=await mkdtemp(join(tmpdir(),'spike-hosted-smoke-')),data=join(root,'data');
const stage='nextgen-staging.nmatunog.workers.dev',origin=`https://${stage}`,port=8788,pgPort=55433;
const env={...process.env,SKIP_AUTO_SHIP:'1',AUTO_SHIP:'0',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:join(root,'wrangler'),LD_LIBRARY_PATH:resolve(bin,'../lib')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_ACCOUNT_ID','DATABASE_URL','MEMBER_DATABASE_URL'])delete env[key];
function run(exe,args){const r=spawnSync(exe,args,{env,encoding:'utf8'});if(r.status!==0)throw new Error(`${exe} failed (local fixture)`);}
let started=false,child,db,log;
try{
 run(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust']);
 run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(data,'server.key'),'-out',join(data,'server.crt'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);await chmod(join(data,'server.key'),0o600);
 run(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'pg.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -c ssl=on`,'-w','start']);started=true;
 db=postgres(`postgres://postgres@127.0.0.1:${pgPort}/postgres`,{max:1,prepare:false,onnotice(){}});
 await db.unsafe('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now())');
 await applyAllMigrations(sql=>db.unsafe(sql));
 const proof=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
 await db.unsafe('INSERT INTO member_private.proof_keys(id,secret) VALUES(true,$1)',[proof]);
 // Password is ephemeral hex, confined to this throwaway DB and ignored config.
 await db.unsafe(`ALTER ROLE member_runtime PASSWORD '${password}'`);
 await writeFile(join(data,'pg_hba.conf'),'hostssl all member_runtime 127.0.0.1/32 scram-sha-256\nhost all postgres 127.0.0.1/32 trust\nlocal all postgres trust\n');
 run(join(bin,'pg_ctl'),['-D',data,'reload']);
 await mkdir('work',{recursive:true});
 const config=resolve('work/worker-hosted-member-smoke.json');
 await writeFile(config,JSON.stringify({name:'member-hosted-local-smoke',main:resolve('.open-next/worker.js'),compatibility_date:'2026-11-13',compatibility_flags:['nodejs_compat','global_fetch_strictly_public'],assets:{directory:resolve('.open-next/assets'),binding:'ASSETS'},vars:{MEMBER_HOSTED_STAGING_ENABLED:'true',MEMBER_EMAIL_VERIFY_STAGING_SKIP:'true',MEMBER_ONBOARDING_ENABLED:'true',VERSA_GET_STAGING_ENABLED:'true',MEMBER_LOCAL_DEMO:'false',MEMBER_PUBLIC_ORIGIN:origin,MEMBER_DATABASE_URL:`postgres://member_runtime:${password}@127.0.0.1:${pgPort}/postgres?sslmode=require`,MEMBER_DB_PROOF_SECRET:proof,MEMBER_SESSION_SECRET:randomBytes(32).toString('hex'),AUTH_SECRET:randomBytes(32).toString('hex')}}),{mode:0o600});
 log=createWriteStream('work/worker-hosted-member-smoke.log');
 env.NODE_EXTRA_CA_CERTS=join(data,'server.crt'); // Trust this one disposable TLS fixture in local workerd only.
 child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--local-protocol','https','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--config',config,'--persist-to',join(root,'state')],{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const jar=new Map();
 function http(path,options={}){return new Promise((done,fail)=>{const r=request({hostname:'127.0.0.1',port,path,rejectUnauthorized:false,method:options.method||'GET',headers:{host:stage,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers},timeout:30000},res=>{for(const c of res.headers['set-cookie']||[]){const [pair]=c.split(';'),i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>done({status:res.statusCode,headers:res.headers,body}));});r.on('error',fail);r.on('timeout',()=>r.destroy(new Error('local worker timeout')));r.end(options.body);});}
 let ready=false;for(let n=0;n<60;n++){if(child.exitCode!==null)throw new Error('local worker exited');try{await http('/signin');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert(ready);
 const fields={mfn:'Worker',mln:'Example',me:'worker@example.test',sfn:'Test',sln:'Sponsor',code:'FREE-SYN00037'};
 let passed=0;
 const arrival=await http('/?'+new URLSearchParams(fields));assert.equal(arrival.status,303);assert(jar.has('spike_versa_preview'));passed++;
 const signup=await http('/signup');assert.equal(signup.status,200);assert(signup.body.includes(fields.me));passed++;
 const post=await http('/api/member/preview-signup',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password:'Synthetic-worker-password-8',confirm:'Synthetic-worker-password-8'})});assert.equal(post.status,200,post.body.slice(0,200));assert.equal(JSON.parse(post.body).readyToSignIn,true);passed++;
 const [account]=await db.unsafe('SELECT a.status,c.email_verified FROM user_accounts a JOIN candidates c ON c.id=a.candidate_id JOIN member_credentials m ON m.account_id=a.id WHERE m.email=$1',[fields.me]);assert.equal(account?.status,'active');assert.equal(account?.email_verified,true);passed++;
 const [mail]=await db.unsafe('SELECT count(*)::int AS n FROM member_local_mail');assert.equal(mail.n,0);passed++;
 for(let n=0;n<2;n++){
  const csrf=JSON.parse((await http('/api/auth/csrf')).body).csrfToken;assert(csrf);
  const signin=await http('/api/auth/callback/member',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded','x-auth-return-redirect':'1'},body:new URLSearchParams({csrfToken:csrf,email:fields.me,password:'Synthetic-worker-password-8',callbackUrl:origin+'/member/account'}).toString()});assert.equal(signin.status,200,signin.body);assert(!JSON.parse(signin.body).url.includes('error='));
  const session=JSON.parse((await http('/api/auth/session')).body);assert(session?.user?.id?.startsWith('member:'));passed++;
  const csrfOut=JSON.parse((await http('/api/auth/csrf')).body).csrfToken;
  await http('/api/auth/signout',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded','x-auth-return-redirect':'1'},body:new URLSearchParams({csrfToken:csrfOut,callbackUrl:origin+'/signin'}).toString()});
  assert(!JSON.parse((await http('/api/auth/session')).body)?.user);passed++;
 }
 const [connections]=await db.unsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='member_runtime'");assert.equal(connections.n,0,'member sockets must be closed between HTTP requests');passed++;
 const logs=await readFile('work/worker-hosted-member-smoke.log','utf8');assert(!logs.includes(fields.me)&&!logs.includes(fields.code));passed++;
 console.log(JSON.stringify({runtime:'local workerd / build:cf',passed,hostedRequests:false,postgres:'disposable loopback TLS + member_runtime SCRAM',hyperdrive:false,mail:0}));
}finally{
 if(child){child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}log?.end();if(db)await db.end();if(started)run(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});await rm('work/worker-hosted-member-smoke.json',{force:true});
}

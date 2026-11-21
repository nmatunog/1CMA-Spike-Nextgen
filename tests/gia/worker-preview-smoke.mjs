// Local workerd only. Never contacts or deploys the real staging Worker.
import {spawn} from 'node:child_process';
import {request} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const stage='nextgen-staging.nmatunog.workers.dev',prod='spike-asc.pages.dev',port=8787;
await mkdir('work',{recursive:true});
const config=resolve('work/worker-preview-smoke.json');
await writeFile(config,JSON.stringify({name:'versa-preview-local-smoke',main:resolve('.open-next/worker.js'),compatibility_date:'2026-11-13',compatibility_flags:['nodejs_compat','global_fetch_strictly_public'],assets:{directory:resolve('.open-next/assets'),binding:'ASSETS'},vars:{VERSA_GET_STAGING_ENABLED:'true',MEMBER_EMAIL_VERIFY_STAGING_SKIP:'true',MEMBER_LOCAL_DEMO:'false',MEMBER_ONBOARDING_ENABLED:'false',MEMBER_PUBLIC_ORIGIN:`http://${stage}`,GIA_PILOT_ENABLED:'true',AUTH_SECRET:'synthetic-local-worker-only-no-real-users-123456789'}}));
const logPath=resolve('work/worker-preview-smoke.log'),log=createWriteStream(logPath);
const env={...process.env,SKIP_AUTO_SHIP:'1',AUTO_SHIP:'0',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:'/tmp/spike-worker-smoke-config'};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_ACCOUNT_ID','DATABASE_URL','MEMBER_DATABASE_URL'])delete env[key];
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--config',config,'--persist-to',resolve('work/worker-preview-smoke-state')],{env,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(log);child.stderr.pipe(log);
function http(path,host,options={}){return new Promise((done,fail)=>{const r=request({hostname:'127.0.0.1',port,path,method:options.method||'GET',headers:{host,...options.headers},timeout:15000},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>done({status:res.statusCode,headers:res.headers,body}));});r.on('timeout',()=>r.destroy(new Error('local_worker_timeout')));r.on('error',fail);r.end(options.body);});}
async function follow(path,host){const seen=new Set();let current=path;for(let n=0;n<5;n++){assert(!seen.has(current),'redirect loop');seen.add(current);const r=await http(current,host);if(!r.headers.location)return {...r,hops:n};const u=new URL(r.headers.location,`http://${host}`);assert.equal(u.hostname,host);current=u.pathname+u.search;}throw new Error('redirect limit');}
const fields={mfn:'Preview',mln:'Example',me:'capture@fixture.example',sfn:'Test',sln:'Sponsor',code:'NBM-12345'};
let passed=0;
try {
 let ready=false;for(let n=0;n<60;n++){if(child.exitCode!==null)throw new Error('local_worker_exited');try{await http('/spike-preview',stage);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
 assert(ready,'local worker startup failed');
 for(const host of [stage,prod])for(const prefix of ['/spike-preview','/'])for(const query of ['fbclid=abc','utm_source=fb','lang=ceb']){const r=await follow(prefix+'?'+query,host);assert.equal(r.status,200);assert(r.hops<=1);passed++;}
 for(const host of [stage,prod]){const r=await http('/spike-preview?fbclid=abc',host,{headers:{cookie:'spike_member_handoff=existing; spike_versa_preview=existing'}});assert.equal(r.status,200);assert.equal(r.headers['set-cookie'],undefined);passed++;}
 const good=await http('/spike-preview?'+new URLSearchParams({...fields,fbclid:'transport-only',utm_source:'fb'}),stage);assert.equal(good.status,303);const clean=new URL(good.headers.location,`http://${stage}`);assert.equal(clean.pathname,'/spike-preview');assert.equal(clean.search,'');const cookies=good.headers['set-cookie']?.join(';')||'';assert(cookies.includes('spike_versa_preview='));assert(!cookies.includes('transport-only'));passed++;
 const broken=new URLSearchParams(fields);broken.delete('sfn');broken.set('sln','Sponsor@sfn=Test');const bad=await http('/spike-preview?'+broken,stage,{headers:{cookie:'spike_versa_preview=old; spike_member_handoff=old'}});assert.equal(bad.status,303);const badClean=new URL(bad.headers.location,`http://${stage}`);assert.equal(badClean.pathname,'/spike-preview');assert.equal(badClean.search,'');const cleared=bad.headers['set-cookie']?.join(';')||'';assert(cleared.includes('spike_versa_preview=;')&&cleared.includes('spike_member_handoff=;')&&/expires=.*1970/i.test(cleared),'expired cookies missing');assert(String(bad.headers['cache-control']).includes('no-store'));assert.equal(bad.headers['referrer-policy'],'no-referrer');passed++;
 const plain=await follow('/spike-preview?'+broken,stage);assert.equal(plain.status,200);assert(plain.body.includes('Ask GIA. Start free.'));passed++;
 const outside=await http('/spike-preview?'+new URLSearchParams(fields),prod,{headers:{cookie:'spike_member_handoff=existing'}});assert.equal(outside.status,200);assert.equal(outside.headers['set-cookie'],undefined);passed++;
 const post=await http('/api/member/preview-signup',stage,{method:'POST',headers:{origin:`http://${stage}`,'content-type':'application/json',cookie:`spike_versa_preview=${new URLSearchParams(fields)}`},body:JSON.stringify({password:'Synthetic-test-password-8',confirm:'Synthetic-test-password-8'})});assert.equal(post.status,503);passed++;
 const reset=await http('/api/member',stage,{method:'POST',headers:{origin:`http://${stage}`,'content-type':'application/json'},body:JSON.stringify({action:'forgot',email:fields.me})});assert.equal(reset.status,200,reset.body.slice(0,160));assert.equal(JSON.parse(reset.body).message,"Password reset isn't available on staging yet");passed++;
 const logs=await readFile(logPath,'utf8');assert(!logs.includes(fields.me));assert(!logs.includes(fields.code));passed++;
 console.log(JSON.stringify({runtime:'local workerd / build:cf',passed,hostedRequests:false,databaseBindings:false}));
} finally {child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));log.end();}

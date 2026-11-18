// Disposable real PostgreSQL for synthetic probes/browser tests only.
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import postgres from 'postgres';
const bin=process.env.MEMBER_TEST_PG_BIN;
if(!bin) throw new Error('Set MEMBER_TEST_PG_BIN to a local PostgreSQL bin directory');
const root=await mkdtemp(join(tmpdir(),'spike-member-pg-')),data=join(root,'data');
const env={...process.env,LD_LIBRARY_PATH:resolve(bin,'../lib')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')};
function run(name,args){const r=spawnSync(join(bin,name),args,{env,encoding:'utf8'});if(r.status!==0) throw new Error(`${name} failed: ${r.stderr}`);}
run('initdb',['-D',data,'-U','postgres','-A','trust']);
run('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o','-h 127.0.0.1 -p 55432','-w','start']);
const admin=postgres('postgres://postgres@127.0.0.1:55432/postgres',{max:1,prepare:false});
await admin.unsafe('CREATE DATABASE member_hardening_test');await admin.end();
console.log('Disposable PostgreSQL ready on loopback 55432. Test-only trust authentication; never use hosted.');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;run('pg_ctl',['-D',data,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
setInterval(()=>{},10000);

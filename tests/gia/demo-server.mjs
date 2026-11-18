// Local synthetic demo only. No production database, credentials or deployment.
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { applyAllMigrations, seedFutureFep, seedSyntheticQueue } from '../../lib/recruitment/demo-seed.mjs';
const pgUrl=process.env.MEMBER_TEST_PG_URL;
let db,server;
if(pgUrl) {
  const u=new URL(pgUrl);
  if(process.env.MEMBER_REAL_PG_TEST!=='true' || u.hostname!=='127.0.0.1' || u.port!=='55432' || u.pathname!=='/member_hardening_test') throw new Error('Only designated local throwaway PostgreSQL is allowed');
  const owner=postgres(pgUrl,{max:1,prepare:false});
  db={exec:text=>owner.unsafe(text),query:async(text,args=[])=>({rows:[...await owner.unsafe(text,args)]}),close:()=>owner.end()};
  await db.exec('DROP SCHEMA IF EXISTS member_private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  server={start:async()=>{},stop:async()=>{}};
} else db=new PGlite();
await db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
await applyAllMigrations((sql) => db.exec(sql));
await seedFutureFep((sql) => db.exec(sql));
if(!server) server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55432, maxConnections: process.env.MEMBER_LOCAL_DEMO === 'true' ? 16 : 1 } );
await server.start();
if(pgUrl) {
  if(!/^[a-f0-9]{64}$/.test(process.env.MEMBER_DB_PROOF_SECRET || '')) throw new Error('Local proof key missing');
  await db.query('INSERT INTO member_private.proof_keys(id,secret) VALUES(true,$1)',[process.env.MEMBER_DB_PROOF_SECRET]);
}

const access = { email: 'admin@example.test', password: randomBytes(24).toString('hex'), leaderEmail: 'leader@example.test', leaderPassword: randomBytes(24).toString('hex') };
await seedSyntheticQueue((sql, params) => db.query(sql, params), access.leaderEmail);
const salt = randomBytes(16).toString('hex');
await mkdir('work',{recursive:true});
await writeFile('work/demo-access.json',JSON.stringify(access),{mode:0o600});
const child = spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3002','-H',process.env.GIA_DEMO_BIND_ADDRESS || '0.0.0.0'], { stdio: 'inherit', env: {
  ...process.env, DATABASE_URL:pgUrl || 'postgres://postgres:postgres@127.0.0.1:55432/postgres',
  GIA_PUBLIC_ORIGIN:'http://127.0.0.1:3002',
  GIA_PILOT_ENABLED:'true', GIA_SESSION_SECRET:randomBytes(32).toString('hex'), AUTH_SECRET:randomBytes(32).toString('hex'),
  GIA_RATE_LIMIT_IP_MAX:'500', GIA_RATE_LIMIT_GLOBAL_MAX:'2000', GIA_URGENT_UNCONSENTED_IP_MAX:'50',
  RECRUITMENT_STAFF_ACCOUNTS:JSON.stringify({[access.email]:{salt,hash:scryptSync(access.password,salt,64).toString('hex')},[access.leaderEmail]:{salt,hash:scryptSync(access.leaderPassword,salt,64).toString('hex')}}),
  RECRUITMENT_STAFF_ROLES:JSON.stringify({[access.email]:'admin',[access.leaderEmail]:'leader'}),
  AIA_DEFAULT_RECRUITER_REGISTRATION_URL: process.env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL || 'https://www.aia.com.ph/en/financialadvisor/join-us-now?reference=eyJjb2RlIjoiMDAwMDAwMDAwIiwibmFtZSI6IlRFU1QvUkVDUlVJVEVSIn0=',
  AIA_DEFAULT_RECRUITER_DISPLAY_NAME: process.env.AIA_DEFAULT_RECRUITER_DISPLAY_NAME || 'TEST/RECRUITER',
}});
child.on('exit',async code => { await server.stop();await db.close();process.exit(code || 0); });
process.on('SIGTERM',() => child.kill('SIGTERM'));
process.on('SIGINT',() => child.kill('SIGTERM'));

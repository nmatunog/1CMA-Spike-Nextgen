// Local synthetic demo only. No production database, credentials or deployment.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { applyAllMigrations } from '../../lib/gia/apply-migrations.mjs';

const db = new PGlite();
await db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
await applyAllMigrations((sql) => db.exec(sql));
await db.exec("INSERT INTO fep_sessions(starts_at,capacity) VALUES(now() + interval '7 days',5)");
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55432 });
await server.start();
const access = { email: 'admin@example.test', password: randomBytes(24).toString('hex'), leaderEmail: 'leader@example.test', leaderPassword: randomBytes(24).toString('hex') };
const salt = randomBytes(16).toString('hex');
await mkdir('work',{recursive:true});
await writeFile('work/demo-access.json',JSON.stringify(access),{mode:0o600});
const child = spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3002','-H','0.0.0.0'], { stdio: 'inherit', env: {
  ...process.env, DATABASE_URL:'postgres://postgres:postgres@127.0.0.1:55432/postgres',
  GIA_PUBLIC_ORIGIN:'http://127.0.0.1:3002',
  GIA_PILOT_ENABLED:'true', GIA_SESSION_SECRET:randomBytes(32).toString('hex'), AUTH_SECRET:randomBytes(32).toString('hex'),
  RECRUITMENT_STAFF_ACCOUNTS:JSON.stringify({[access.email]:{salt,hash:scryptSync(access.password,salt,64).toString('hex')},[access.leaderEmail]:{salt,hash:scryptSync(access.leaderPassword,salt,64).toString('hex')}}),
  RECRUITMENT_STAFF_ROLES:JSON.stringify({[access.email]:'admin',[access.leaderEmail]:'leader'}),
}});
child.on('exit',async code => { await server.stop();await db.close();process.exit(code || 0); });
process.on('SIGTERM',() => child.kill('SIGTERM'));
process.on('SIGINT',() => child.kill('SIGTERM'));

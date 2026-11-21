import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({clients:[] as {end:ReturnType<typeof vi.fn>;unsafe:ReturnType<typeof vi.fn>}[],fail:false}));
vi.mock('postgres',()=>({default:vi.fn(()=>{
 const unsafe=vi.fn(async(text:string)=>{
  if(text.includes('FROM pg_roles r WHERE'))return [{rolname:'member_runtime',rolcanlogin:true,memberships:['member_app']}];
  if(text==='FAIL')throw new Error('synthetic failure');return [];
 });
 const client={unsafe,end:vi.fn(async()=>{}),json:vi.fn(x=>x),begin:vi.fn(async(work:(c:unknown)=>unknown)=>{if(mock.fail)throw new Error('begin failed');return work(client);})};
 mock.clients.push(client);return client;
})}));
import {memberDb,SCOPE_SQL} from './db';
beforeEach(()=>{vi.stubEnv('MEMBER_DATABASE_URL','postgres://member_runtime:synthetic@db.fixture.example/staging?sslmode=require');vi.stubEnv('MEMBER_DB_PROOF_SECRET','ab'.repeat(32));mock.clients.length=0;mock.fail=false;});
afterEach(()=>vi.unstubAllEnvs());
it('creates no socket at factory time and never reuses an ended client',async()=>{const db=memberDb();expect(mock.clients).toHaveLength(0);await db.query('SELECT 1');await db.query('SELECT 2');expect(mock.clients).toHaveLength(2);for(const c of mock.clients)expect(c.end).toHaveBeenCalledOnce();});
it.each([false,true])('closes on work/begin failure (begin=%s)',async begin=>{mock.fail=begin;await expect(memberDb().query('FAIL')).rejects.toThrow();expect(mock.clients[0].end).toHaveBeenCalledOnce();});
it('shares one client within an atomic transaction and isolates concurrent scopes',async()=>{const db=memberDb();await Promise.all(['one@example.test','two@example.test'].map(email=>db.scope({email}).transaction(async tx=>{await tx.query('SELECT 1');await tx.query('SELECT 2');expect(()=>tx.scope({email:'other@example.test'})).toThrow('cannot_rescope');})));expect(mock.clients).toHaveLength(2);expect(mock.clients.map(c=>c.unsafe.mock.calls.find(call=>call[0]===SCOPE_SQL)?.[1])).toEqual([['one@example.test','','',''],['two@example.test','','','']]);for(const c of mock.clients)expect(c.end).toHaveBeenCalledOnce();});

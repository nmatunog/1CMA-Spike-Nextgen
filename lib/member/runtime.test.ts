import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(()=>({})),headers:vi.fn()}));
vi.mock('./db',()=>({memberDb:mocks.db}));
vi.mock('next/headers',()=>({headers:mocks.headers}));
import {memberService} from './runtime';
const stage='nextgen-staging.nmatunog.workers.dev';
beforeEach(()=>{
 vi.stubEnv('MEMBER_ONBOARDING_ENABLED','true');vi.stubEnv('MEMBER_LOCAL_DEMO','true');
 vi.stubEnv('MEMBER_PUBLIC_ORIGIN','http://127.0.0.1:3002');vi.stubEnv('DATABASE_URL','postgres://postgres@127.0.0.1:55432/postgres');
 vi.stubEnv('MEMBER_DATABASE_URL','postgres://member_runtime@127.0.0.1:55432/postgres');vi.stubEnv('MEMBER_DB_PROOF_SECRET','ab'.repeat(32));
 vi.stubEnv('MEMBER_SESSION_SECRET','synthetic-test-session-secret-only-123456789');vi.stubEnv('AUTH_SECRET','synthetic-test-auth-secret-only-123456789');
 vi.stubEnv('MEMBER_HOSTED_STAGING_ENABLED','');vi.stubEnv('MEMBER_EMAIL_VERIFY_STAGING_SKIP','');
 mocks.headers.mockResolvedValue(new Headers({host:'127.0.0.1:3002'}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function hosted(){vi.stubEnv('MEMBER_LOCAL_DEMO','false');vi.stubEnv('DATABASE_URL','');vi.stubEnv('MEMBER_PUBLIC_ORIGIN',`https://${stage}`);vi.stubEnv('MEMBER_DATABASE_URL','postgres://member_runtime:synthetic@db.fixture.example/staging?sslmode=require');vi.stubEnv('MEMBER_HOSTED_STAGING_ENABLED','true');vi.stubEnv('MEMBER_EMAIL_VERIFY_STAGING_SKIP','true');mocks.headers.mockResolvedValue(new Headers({host:stage}));}
it('is disabled by default without storage',async()=>{vi.stubEnv('MEMBER_ONBOARDING_ENABLED','');await expect(memberService()).rejects.toThrow('member_unavailable');expect(mocks.db).not.toHaveBeenCalled();});
it('retains the local demo path',async()=>{expect((await memberService()).origin).toBe('http://127.0.0.1:3002');});
it.each([['MEMBER_LOCAL_DEMO','false'],['MEMBER_PUBLIC_ORIGIN','https://staging.example.test'],['DATABASE_URL','postgres://synthetic@database.example.test/example'],['MEMBER_SESSION_SECRET','short'],['AUTH_SECRET','build-placeholder-prod-requires-env-auth-secret-min-32!!']])('local fail-closed %s',async(key,value)=>{vi.stubEnv(key,value);await expect(memberService()).rejects.toThrow('member_dependency_unavailable');expect(mocks.db).not.toHaveBeenCalled();});
it('accepts exact hosted opt-in without canonical DATABASE_URL, including async page host discovery',async()=>{hosted();expect((await memberService()).origin).toBe(`https://${stage}`);expect(mocks.db).toHaveBeenCalledOnce();});
it.each(['spike-asc.pages.dev','pilot.example.test',`other.${stage}`,`${stage}.evil.example`,'localhost'])('fails closed for other request host %s',async host=>{hosted();await expect(memberService(host)).rejects.toThrow('member_dependency_unavailable');expect(mocks.db).not.toHaveBeenCalled();});
it.each([['MEMBER_HOSTED_STAGING_ENABLED','false'],['MEMBER_PUBLIC_ORIGIN',`http://${stage}`],['MEMBER_PUBLIC_ORIGIN',`https://${stage}/extra`],['MEMBER_EMAIL_VERIFY_STAGING_SKIP','false'],['MEMBER_SESSION_SECRET',''],['AUTH_SECRET','']])('hosted fail-closed %s',async(key,value)=>{hosted();vi.stubEnv(key,value);await expect(memberService(stage)).rejects.toThrow('member_dependency_unavailable');expect(mocks.db).not.toHaveBeenCalled();});
it.each([['MEMBER_DATABASE_URL',''],['MEMBER_DATABASE_URL','postgres://postgres:synthetic@db.fixture.example/staging?sslmode=require'],['MEMBER_DATABASE_URL','postgres://member_runtime:synthetic@db.fixture.example/staging'],['MEMBER_DATABASE_URL','postgres://member_runtime:synthetic@db.fixture.example/staging?sslmode=disable'],['MEMBER_DATABASE_URL','postgres://member_runtime@db.fixture.example/staging?sslmode=require'],['MEMBER_DATABASE_URL','postgres://member_runtime:synthetic@db.fixture.example/staging?sslmode=require&sslmode=disable'],['MEMBER_DB_PROOF_SECRET',''],['MEMBER_DB_PROOF_SECRET','short']])('hosted storage fail-closed %s',async(key,value)=>{hosted();vi.stubEnv(key,value);await expect(memberService(stage)).rejects.toThrow('member_storage_unconfigured');expect(mocks.db).not.toHaveBeenCalled();});

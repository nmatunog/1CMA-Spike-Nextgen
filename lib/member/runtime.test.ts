import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ memberDb: () => { throw new Error('must_not_connect'); } }));
import { memberService } from './runtime';
beforeEach(() => {
  vi.stubEnv('MEMBER_ONBOARDING_ENABLED','true'); vi.stubEnv('MEMBER_LOCAL_DEMO','true');
  vi.stubEnv('MEMBER_PUBLIC_ORIGIN','http://127.0.0.1:3002'); vi.stubEnv('DATABASE_URL','postgres://postgres:postgres@127.0.0.1:55432/postgres');
  vi.stubEnv('MEMBER_SESSION_SECRET','synthetic-test-session-secret-only-123456789'); vi.stubEnv('AUTH_SECRET','synthetic-test-auth-secret-only-123456789');
});
afterEach(() => vi.unstubAllEnvs());
it('is disabled by default and never connects to storage', () => {
  vi.stubEnv('MEMBER_ONBOARDING_ENABLED',''); expect(() => memberService()).toThrow('member_unavailable');
});
it.each([
  ['MEMBER_LOCAL_DEMO','false'], ['MEMBER_PUBLIC_ORIGIN','https://staging.example.test'],
  ['DATABASE_URL','postgres://synthetic:synthetic@database.example.test/example'],
  ['MEMBER_SESSION_SECRET','short'], ['AUTH_SECRET','build-placeholder-prod-requires-env-auth-secret-min-32!!'],
])('fails closed before storage for %s', (key,value) => {
  vi.stubEnv(key,value); expect(() => memberService()).toThrow('member_dependency_unavailable');
});

import {afterEach,expect,it,vi} from 'vitest';
import {stagingEmailSkipEnabled} from './staging-email';
afterEach(()=>vi.unstubAllEnvs());
it('defaults off, requires exact host, and requires local opt-in for loopback',()=>{
 vi.stubEnv('MEMBER_EMAIL_VERIFY_STAGING_SKIP','');expect(stagingEmailSkipEnabled('nextgen-staging.nmatunog.workers.dev')).toBe(false);
 vi.stubEnv('MEMBER_EMAIL_VERIFY_STAGING_SKIP','true');vi.stubEnv('MEMBER_LOCAL_DEMO','');expect(stagingEmailSkipEnabled('nextgen-staging.nmatunog.workers.dev')).toBe(true);
 for(const host of ['localhost','127.0.0.1','spike-asc.pages.dev','nextgen-staging.nmatunog.workers.dev.evil.example'])expect(stagingEmailSkipEnabled(host)).toBe(false);
 vi.stubEnv('MEMBER_LOCAL_DEMO','true');expect(stagingEmailSkipEnabled('localhost')).toBe(true);expect(stagingEmailSkipEnabled('127.0.0.1')).toBe(true);expect(stagingEmailSkipEnabled('pilot.example.test')).toBe(false);
});

import { headers } from 'next/headers';
import { syntheticCodeFormat } from './code-format';
import { memberDb } from './db';
import { MemberError, MemberService } from './service';
import { syntheticMailSink } from './mail';
import { syntheticVerifier } from './verifier';
import { hostedStagingEnabled, HOSTED_MEMBER_ORIGIN, loopbackHost } from './hosted-staging';
import { stagingEmailSkipEnabled } from './staging-email';

// Only designated synthetic inventory is supplied; no entitlement or real verifier.
export const memberAdapters = { codeFormat: syntheticCodeFormat, authoritativeSource: 'pending' } as const;
// Data-only synthetic inventory preserves its existing attempt counters. No sockets.
let fixture: ReturnType<typeof syntheticVerifier> | undefined;
export function memberEnabled() { return process.env.MEMBER_ONBOARDING_ENABLED === 'true'; }
export async function memberService(requestHost?: string) {
  if (!memberEnabled()) throw new MemberError('member_unavailable',503);
  const origin=process.env.MEMBER_PUBLIC_ORIGIN || '',secret=process.env.MEMBER_SESSION_SECRET || '',authSecret=process.env.AUTH_SECRET || '';
  if (secret.length<32 || authSecret.length<32 || /placeholder|dev-only/.test(authSecret)) throw new MemberError('member_dependency_unavailable',503);
  let app: URL;
  try {app=new URL(origin);} catch {throw new MemberError('member_dependency_unavailable',503);}
  const host=requestHost ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const hosted=hostedStagingEnabled(host);
  if (hosted) {
    if(app.origin!==HOSTED_MEMBER_ORIGIN || app.pathname!=='/' || app.search || app.hash || app.username || app.password || !stagingEmailSkipEnabled(host)) throw new MemberError('member_dependency_unavailable',503);
  } else {
    let local=false;
    try {local=app.protocol==='http:' && loopbackHost(app.hostname) && loopbackHost(host) && loopbackHost(new URL(process.env.DATABASE_URL || '').hostname);}catch{/* Fail closed. */}
    if(process.env.MEMBER_LOCAL_DEMO!=='true' || !local) throw new MemberError('member_dependency_unavailable',503);
  }
  if(!/^[a-f0-9]{64}$/.test(process.env.MEMBER_DB_PROOF_SECRET || '')) throw new MemberError('member_storage_unconfigured',503);
  try {
    const member=new URL(process.env.MEMBER_DATABASE_URL || '');
    if(!['postgres:','postgresql:'].includes(member.protocol) || member.username!=='member_runtime' || member.pathname==='/') throw new Error('invalid');
    if(hosted) {
      if(member.searchParams.getAll('sslmode').length!==1 || member.searchParams.get('sslmode')!=='require' || !member.password) throw new Error('invalid');
    } else {
      const canonical=new URL(process.env.DATABASE_URL || '');
      if(!loopbackHost(member.hostname) || member.hostname!==canonical.hostname || member.port!==canonical.port || member.pathname!==canonical.pathname) throw new Error('invalid');
    }
  }catch{throw new MemberError('member_storage_unconfigured',503);}
  const db=memberDb();
  const verifier={async check(code: string,identity: Parameters<Awaited<ReturnType<typeof syntheticVerifier>>['verifier']['check']>[1]){
    fixture ||= syntheticVerifier(secret);return (await fixture).verifier.check(code,identity);
  }};
  const mail=hosted?{async send(){throw new MemberError('member_mail_unavailable',503);}}:syntheticMailSink(db);
  return new MemberService(db,secret,app.origin,mail,verifier);
}

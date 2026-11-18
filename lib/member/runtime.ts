import { syntheticCodeFormat } from './code-format';
import { memberDb } from './db';
import { MemberError, MemberService } from './service';
import { syntheticMailSink } from './mail';
import { syntheticVerifier } from './verifier';

// Configuration seam: replace only after the partner format contract is approved.
export const memberAdapters = { codeFormat: syntheticCodeFormat, authoritativeSource: 'pending' } as const;
let verifier: ReturnType<typeof syntheticVerifier> | undefined;
export function memberEnabled() { return process.env.MEMBER_ONBOARDING_ENABLED === 'true'; }
export function memberService() {
  if (!memberEnabled()) throw new MemberError('member_unavailable', 503);
  const origin = process.env.MEMBER_PUBLIC_ORIGIN || '';
  const secret = process.env.MEMBER_SESSION_SECRET || '';
  const authSecret = process.env.AUTH_SECRET || '';
  let local = false;
  try {
    const url = new URL(origin), database = new URL(process.env.DATABASE_URL || '');
    local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && ['127.0.0.1', 'localhost'].includes(database.hostname);
  } catch { /* A missing integration fails closed. */ }
  if (process.env.MEMBER_LOCAL_DEMO !== 'true' || !local || secret.length < 32 || authSecret.length < 32 || /placeholder|dev-only/.test(authSecret)) throw new MemberError('member_dependency_unavailable', 503);
  const db = memberDb();
  const codeVerifier = { async check(code: string, identity: Parameters<Awaited<ReturnType<typeof syntheticVerifier>>['verifier']['check']>[1]) {
    verifier ||= syntheticVerifier(secret);
    return (await verifier).verifier.check(code, identity);
  } };
  return new MemberService(db, secret, new URL(origin).origin, syntheticMailSink(db), codeVerifier);
}

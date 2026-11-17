import { NextRequest } from 'next/server';
import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
import { HANDOFF_COOKIE, memberJson, setHandoff, smallJson } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { currentMember } from '@/lib/member/session';
import { MemberError } from '@/lib/member/service';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const service = memberService();
    if (request.headers.get('origin') !== service.origin) return memberJson({ error: 'origin_required' }, 403);
    await service.limit(`post:${clientIpFromRequest(request)}`, 90);
    const body = await smallJson(request);
    const allowed: Record<string, string[]> = {
      begin: ['action'], verify: ['action', 'token'], signup: ['action', 'password', 'confirm'],
      claim: ['action'], logout: ['action'], forgot: ['action', 'email'], reset: ['action', 'token', 'password', 'confirm'],
      change: ['action', 'currentPassword', 'password', 'confirm'],
    };
    if (typeof body.action !== 'string' || !Object.hasOwn(allowed, body.action) || Object.keys(body).some(key => !allowed[body.action as string].includes(key))) throw new MemberError('invalid_request');
    const cookie = request.cookies.get(HANDOFF_COOKIE)?.value;
    if (body.action === 'begin') {
      await service.requestVerification(cookie);
      return memberJson({ ok: true, message: 'Verification request recorded. This draft does not send email; use the local synthetic test mailbox.' });
    }
    if (body.action === 'verify') {
      const token = await service.verifyEmail(body.token);
      return setHandoff(memberJson({ ok: true }), token, service.origin);
    }
    if (body.action === 'signup') {
      await service.signup(cookie, body.password, body.confirm);
      return memberJson({ ok: true });
    }
    if (body.action === 'forgot') {
      try { await service.forgot(body.email, cookie); } catch (failure) { if (failure instanceof MemberError && failure.status === 429) throw failure; }
      return memberJson({ ok: true, message: 'Request recorded. If an eligible account exists, a reset will be prepared. This draft does not send email.' });
    }
    if (body.action === 'reset') {
      const proof = await service.reset(body.token, body.password, body.confirm);
      if (!proof) await service.expire(cookie);
      return setHandoff(memberJson({ ok: true }), proof || '', service.origin);
    }
    const member = await currentMember(service);
    if (body.action === 'logout') {
      if (member) await service.logout(member, cookie); else await service.expire(cookie);
      return setHandoff(memberJson({ ok: true }), '', service.origin);
    }
    if (!member) return memberJson({ error: 'sign_in_required' }, 401);
    if (body.action === 'claim') { await service.link(cookie, member); return memberJson({ ok: true }); }
    await service.change(member, body.currentPassword, body.password, body.confirm);
    await service.expire(cookie);
    return setHandoff(memberJson({ ok: true }), '', service.origin);
  } catch (error) {
    return memberJson({ error: error instanceof MemberError ? error.code : 'request_unavailable' }, error instanceof MemberError ? error.status : 400);
  }
}

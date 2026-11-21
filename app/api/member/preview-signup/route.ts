import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { decodeVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import { memberJson, setHandoff, smallJson } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
import { stagingEmailSkipEnabled } from '@/lib/member/staging-email';
import { MemberError } from '@/lib/member/service';
import { parseHandoff, validPassword } from '@/lib/member/contract';
import { consumeTicket, issueTicket } from '@/lib/member/transport';
export const dynamic = 'force-dynamic';
/** Explicit local synthetic POST only. GET context is never proof of identity. */
export async function POST(request: NextRequest) {
  const url=new URL(request.url);
  if (!previewHost(url.host)) return memberJson({error:'preview_unavailable'},503);
  const preview=decodeVersaPreview(request.cookies.get(VERSA_PREVIEW_COOKIE)?.value);
  if (!preview) return memberJson({error:'handoff_unavailable'},400);
  // Hosted remains 503, before ticket issuance/DB access; reuse the existing gate.
  if (process.env.MEMBER_LOCAL_DEMO!=='true' || !['127.0.0.1','localhost'].includes(url.hostname)) return memberJson({error:'preview_account_dependency'},503);
  if (request.headers.get('origin')!==process.env.MEMBER_PUBLIC_ORIGIN) return memberJson({error:'origin_required'},403);
  let service;
  try { service=memberService(); } catch { return memberJson({error:'preview_account_dependency'},503); }
  try {
    const body=await smallJson(request);
    if (Object.keys(body).some(k=>!['password','confirm'].includes(k)) || !validPassword(body.password) || body.password!==body.confirm) return memberJson({error:'password_invalid'},400);
    await service.limit(`preview-signup:${preview.me}`,10);
    const payload=parseHandoff(new URLSearchParams(preview));
    // Only the local synthetic adapter may issue this ticket. Account binding still
    // requires the existing email verification, code verifier and DB proofs.
    const ticket=await issueTicket(service,payload,randomBytes(32).toString('hex'));
    const handoff=await consumeTicket(service,ticket);
    if (stagingEmailSkipEnabled(url.hostname)) {
      const signup=await service.signupForRequest(handoff,body.password,body.confirm,url.hostname,clientIpFromRequest(request));
      return setHandoff(memberJson({ok:true,readyToSignIn:signup.readyToSignIn}),signup.handoff,service.origin);
    }
    await service.signup(handoff,body.password,body.confirm);
    return setHandoff(memberJson({ok:true}),handoff,service.origin);
  } catch(error) { return memberJson({error:error instanceof MemberError ? error.code : 'request_unavailable'},error instanceof MemberError ? error.status : 400); }
}

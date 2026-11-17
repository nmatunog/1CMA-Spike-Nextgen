import { NextRequest } from 'next/server';
import { memberService, memberAdapters } from '@/lib/member/runtime';
import { memberJson, smallText } from '@/lib/member/http';
import { authenticatedPayload, issueTicket } from '@/lib/member/transport';
import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
export const dynamic = 'force-dynamic';
/** Draft server-to-server issuer. Hosted runtime remains disabled pending dependencies. */
export async function POST(request: NextRequest) {
  try {
    const service = memberService();
    await service.limit(`issuer:${clientIpFromRequest(request)}`, 30);
    const { payload, nonce } = authenticatedPayload(process.env.MEMBER_HANDOFF_ISSUER_SECRET || '', request.headers, await smallText(request, 16384), service.clock(), memberAdapters.codeFormat);
    if (!/^[^@]+@example\.test$/.test(payload.me) || !/^(FREE|PRO)-SYN\d{5}$/.test(payload.code)) throw new Error('synthetic_only');
    const ticket = await issueTicket(service, payload, nonce);
    return memberJson({ url: `${service.origin}/?handoff=${ticket}` });
  } catch { return memberJson({ error: 'handoff_unavailable' }, 400); }
}

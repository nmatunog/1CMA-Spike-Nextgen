import { NextRequest, NextResponse } from 'next/server';
import { parseHandoff } from '@/lib/member/contract';
import { memberService, memberAdapters } from '@/lib/member/runtime';
import { HANDOFF_COOKIE, PRIVATE_HEADERS, setHandoff } from '@/lib/member/http';
import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
import { consumeTicket } from '@/lib/member/transport';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const response = new NextResponse(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: '/signup' } });
  try {
    const service = await memberService(new URL(request.url).hostname);
    await service.limit(`arrival:${clientIpFromRequest(request)}`, 60);
    const params = new URL(request.url).searchParams;
    let token: string;
    if (params.has('handoff')) {
      if ([...params].length !== 1) throw new Error('ambiguous_ticket');
      token = await consumeTicket(service, params.get('handoff') || '');
    } else {
      // Explicit opt-in for old LOCAL synthetic fixtures only; never a hosted contract.
      if (process.env.MEMBER_ALLOW_PLAIN_QUERY !== 'true' || process.env.MEMBER_LOCAL_DEMO !== 'true') throw new Error('unsigned_handoff');
      const data = parseHandoff(params, memberAdapters.codeFormat);
      if (!/^[^@]+@example\.test$/.test(data.me) || !/^(FREE|PRO)-SYN\d{5}$/.test(data.code)) throw new Error('synthetic_only');
      token = await service.prepare(data);
    }
    return setHandoff(response, token, service.origin);
  } catch {
    response.cookies.set(HANDOFF_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
    return response;
  }
}

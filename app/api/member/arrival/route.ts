import { NextRequest, NextResponse } from 'next/server';
import { parseHandoff } from '@/lib/member/contract';
import { memberService } from '@/lib/member/runtime';
import { HANDOFF_COOKIE, PRIVATE_HEADERS, setHandoff } from '@/lib/member/http';
import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const response = new NextResponse(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: '/signup' } });
  try {
    const service = memberService();
    await service.limit(`arrival:${clientIpFromRequest(request)}`, 60);
    const data = parseHandoff(new URL(request.url).searchParams);
    // This adapter is synthetic-only until real provider/storage wiring is reviewed.
    if (!/^[^@]+@example\.test$/.test(data.me) || !/^(FREE|PRO)-SYN\d{5}$/.test(data.code)) throw new Error('synthetic_only');
    const token = await service.prepare(data);
    if ((await service.credential(data.me) || await service.pending(data.me))) response.headers.set('Location', '/signin');
    return setHandoff(response, token, service.origin);
  } catch {
    response.cookies.set(HANDOFF_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
    return response;
  }
}

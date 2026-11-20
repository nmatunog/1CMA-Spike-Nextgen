import { NextRequest, NextResponse } from 'next/server';
import { GET as receiveHandoff } from './api/member/arrival/route';
import { HANDOFF_COOKIE, PRIVATE_HEADERS } from '@/lib/member/http';
import { parseVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
export const dynamic = 'force-dynamic';
/** Consume the partner GET at root before any redirect can propagate its fields. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const preview = previewHost(url.hostname) ? parseVersaPreview(url.searchParams) : null;
  if (preview) {
    const response = new NextResponse(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: '/spike-preview' } });
    response.cookies.set(VERSA_PREVIEW_COOKIE, new URLSearchParams(preview).toString(), { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 15 * 60 });
    response.cookies.delete(HANDOFF_COOKIE);
    return response;
  }
  const known = ['handoff','mfn','mln','me','sfn','sln','code','fname','lname'];
  if ([...url.searchParams.keys()].some(key => known.includes(key.toLowerCase()))) {
    const response = await receiveHandoff(request);
    response.cookies.delete(VERSA_PREVIEW_COOKIE);
    return response;
  }
  url.pathname = '/spike-preview';
  return new NextResponse(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: url.pathname + url.search } });
}

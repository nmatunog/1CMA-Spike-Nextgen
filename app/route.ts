import { NextRequest, NextResponse } from 'next/server';
import { GET as receiveHandoff } from './api/member/arrival/route';
import { PRIVATE_HEADERS } from '@/lib/member/http';
export const dynamic = 'force-dynamic';
/** Consume the partner GET at root before any redirect can propagate its fields. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const known = ['handoff','mfn','mln','me','sfn','sln','code','fname','lname'];
  if ([...url.searchParams.keys()].some(key => known.includes(key.toLowerCase()))) return receiveHandoff(request);
  url.pathname = '/spike-preview';
  return new NextResponse(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: url.pathname + url.search } });
}

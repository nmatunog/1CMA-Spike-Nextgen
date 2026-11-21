import { NextRequest, NextResponse } from 'next/server';
import { parseVersaPreview, previewHost, VERSA_FIELDS, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import { HANDOFF_COOKIE, PRIVATE_HEADERS } from '@/lib/member/http';
/** Only intercept a gated Versa capture attempt, never ordinary page queries. */
export function middleware(request: NextRequest) {
  if (request.method!=='GET' || !previewHost(request.nextUrl.hostname) ||
      ![...request.nextUrl.searchParams.keys()].some(key=>VERSA_FIELDS.includes(key.toLowerCase() as typeof VERSA_FIELDS[number]))) return NextResponse.next();
  if (parseVersaPreview(request.nextUrl.searchParams)) {
    const target=request.nextUrl.clone();target.pathname='/';
    return NextResponse.rewrite(target,{headers:PRIVATE_HEADERS});
  }
  // OpenNext preserves query parameters across rewrites. An explicit clean
  // redirect is required here; rewriting to / would loop or enter signup.
  const clean=request.nextUrl.clone();clean.search='';clean.pathname='/spike-preview';
  const response=NextResponse.redirect(clean,303);
  for(const [key,value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key,value);
  response.cookies.delete(VERSA_PREVIEW_COOKIE);response.cookies.delete(HANDOFF_COOKIE);
  return response;
}
export const config={matcher:['/spike-preview']};

import { NextRequest, NextResponse } from 'next/server';
import { parseVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import { HANDOFF_COOKIE, PRIVATE_HEADERS } from '@/lib/member/http';
/** Reuse the root GET receiver: page rendering itself cannot set cookies. */
export function middleware(request: NextRequest) {
  if (request.method!=='GET' || !request.nextUrl.search) return NextResponse.next();
  const preview=previewHost(request.nextUrl.hostname) ? parseVersaPreview(request.nextUrl.searchParams) : null;
  const target=request.nextUrl.clone();
  target.pathname='/';
  if (!preview) target.search='';
  const response=NextResponse.rewrite(target,{headers:PRIVATE_HEADERS});
  // Invalid links must not retain data from a previous, valid preview.
  if (!preview) {
    response.cookies.delete(VERSA_PREVIEW_COOKIE);
    response.cookies.delete(HANDOFF_COOKIE);
  }
  return response;
}
export const config={matcher:['/spike-preview']};

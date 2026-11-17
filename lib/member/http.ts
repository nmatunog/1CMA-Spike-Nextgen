import { NextResponse } from 'next/server';
export const HANDOFF_COOKIE = 'spike_member_handoff';
export const PRIVATE_HEADERS = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
export function memberJson(body: object, status = 200) { return NextResponse.json(body, { status, headers: PRIVATE_HEADERS }); }
export function setHandoff(response: NextResponse, token: string, origin: string) {
  response.cookies.set(HANDOFF_COOKIE, token, { httpOnly: true, secure: new URL(origin).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: token ? 15 * 60 : 0 });
  return response;
}
export async function smallJson(request: Request) {
  if (Number(request.headers.get('content-length')) > 4096 || !request.headers.get('content-type')?.includes('application/json')) throw new Error('invalid_request');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_request');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new Error('invalid_request'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request');
  return value as Record<string, unknown>;
}

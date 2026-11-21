import { clientIpFromRequest } from '@/lib/gia/rate.mjs';
import { HANDOFF_COOKIE } from './http';
import { memberService } from './runtime';
export async function authorizeMember(credentials: Partial<Record<'email' | 'password', unknown>>, request: Request) {
  try {
    const service = await memberService(new URL(request.url).hostname);
    const proof = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${HANDOFF_COOKIE}=`))?.slice(HANDOFF_COOKIE.length + 1);
    const member = await service.signIn(credentials.email, credentials.password, clientIpFromRequest(request), proof);
    return member ? { id: `member:${member.accountId}`, email: member.email, name: 'SPIKE member', authVersion: member.version } : null;
  } catch { return null; }
}

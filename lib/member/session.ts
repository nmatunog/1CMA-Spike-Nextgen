import { auth } from '@/auth';
import { memberService } from './runtime';
import type { MemberService } from './service';
import type { Member } from './service';
export async function currentMember(service?: MemberService): Promise<Member | null> {
  service ??= await memberService();
  const session = await auth();
  const id = session?.user?.id;
  if (!id?.startsWith('member:') || !/^[a-f0-9-]{36}$/.test(id.slice(7))) return null;
  const version = (session?.user as { authVersion?: number }).authVersion;
  if (!version) return null;
  return service.session(id.slice(7), version);
}

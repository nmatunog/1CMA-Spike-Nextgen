import { cookies } from 'next/headers';
import { HANDOFF_COOKIE } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { MemberSignIn } from '@/components/member/MemberForms';
export default async function SigninPage() {
  const h = await (async () => { try { return await memberService().handoff((await cookies()).get(HANDOFF_COOKIE)?.value); } catch { return null; } })();
  return <MemberSignIn initialEmail={h?.payload.me || ''} hasHandoff={Boolean(h)} verified={Boolean(h?.verified_at)} />;
}

import { decodeVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import { cookies, headers } from 'next/headers';
import { HANDOFF_COOKIE } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { MemberSignIn } from '@/components/member/MemberForms';
export default async function SigninPage() {
  const preview=previewHost((await headers()).get('host') || '') ? decodeVersaPreview((await cookies()).get(VERSA_PREVIEW_COOKIE)?.value) : null;
  const h = await (async () => { try { return await memberService().handoff((await cookies()).get(HANDOFF_COOKIE)?.value); } catch { return null; } })();
  return <MemberSignIn initialEmail={h?.payload.me || preview?.me || ''} meetGia={Boolean(preview)} hasHandoff={Boolean(h)} verified={Boolean(h?.verified_at)} />;
}

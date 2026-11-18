import { decodeVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import { cookies, headers } from 'next/headers';
import { HANDOFF_COOKIE } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { MemberSignup } from '@/components/member/MemberForms';
import styles from '@/components/member/member.module.css';
export default async function SignupPage() {
  const host = (await headers()).get('host') ?? '';
  const preview = previewHost(host) ? decodeVersaPreview((await cookies()).get(VERSA_PREVIEW_COOKIE)?.value) : null;
  if (preview && !(await cookies()).get(HANDOFF_COOKIE)?.value) return <section className={styles.card}><h2>Your signup details</h2><p>The details above are read-only. This synthetic welcome preview does not create an account. Password setup and email verification require the connected member service.</p><a href="/spike-preview">Continue exploring with GIA</a></section>;
  const data = await (async () => {
    try {
      const service = memberService();
      const h = await service.handoff((await cookies()).get(HANDOFF_COOKIE)?.value);
      const { extra, ...fields } = h.payload; void extra;
      return { fields };
    } catch { return null; }
  })();
  return data ? <MemberSignup fields={data.fields} /> : <section className={styles.card}><h1>Open your Versa handoff</h1><p className={styles.accountCopy}>This handoff is unavailable or has expired. Return to Versa for a new one.</p><a href="/spike-preview">Ask GIA</a><p><a href="/signin">Sign in</a></p></section>;
}

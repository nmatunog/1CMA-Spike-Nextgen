import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { HANDOFF_COOKIE } from '@/lib/member/http';
import { memberService } from '@/lib/member/runtime';
import { MemberSignup } from '@/components/member/MemberForms';
import styles from '@/components/member/member.module.css';
export default async function SignupPage() {
  const data = await (async () => {
    try {
      const service = memberService();
      const h = await service.handoff((await cookies()).get(HANDOFF_COOKIE)?.value);
      const { extra, ...fields } = h.payload; void extra;
      return { fields, existing: Boolean(await service.credential(h.payload.me) || await service.pending(h.payload.me)) };
    } catch { return null; }
  })();
  if (data?.existing) redirect('/signin');
  return data ? <MemberSignup fields={data.fields} /> : <section className={styles.card}><h1>Open your Versa handoff</h1><p className={styles.accountCopy}>This handoff is unavailable or has expired. Return to Versa for a new one.</p><a href="/spike-preview">Ask GIA</a><p><a href="/signin">Sign in</a></p></section>;
}

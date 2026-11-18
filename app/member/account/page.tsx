import { currentMember } from '@/lib/member/session';
import { memberService } from '@/lib/member/runtime';
import { MemberAccount } from '@/components/member/MemberForms';
import styles from '@/components/member/member.module.css';
export default async function Page() {
  const data = await (async () => {
    try {
      const service = memberService();
      const member = await currentMember(service);
      if (!member) return null;
      return { email: member.email };
    } catch { return null; }
  })();
  return data ? <MemberAccount {...data} /> : <section className={styles.card}><h1>Sign in to continue</h1><a href="/signin">Member sign in</a><p><a href="/gia">Ask GIA</a></p></section>;
}

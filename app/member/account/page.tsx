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
      const [claim] = await service.db.query('SELECT sponsor_first,sponsor_last FROM member_handoff_claims WHERE account_id=$1 ORDER BY created_at DESC LIMIT 1', [member.accountId]);
      return { email: member.email, sponsor: claim ? `${claim.sponsor_first} ${claim.sponsor_last}` : '' };
    } catch { return null; }
  })();
  return data ? <MemberAccount {...data} /> : <section className={styles.card}><h1>Sign in to continue</h1><a href="/signin">Member sign in</a><p><a href="/gia">Ask GIA</a></p></section>;
}

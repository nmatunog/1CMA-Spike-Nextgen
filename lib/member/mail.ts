import type { MemberDb } from './db';
export interface MemberMailer { send(input: { destination: string; kind: 'verify' | 'reset'; link: string }): Promise<void> }
/** Local synthetic sink only. It does not send email or provide a public mailbox API. */
export function syntheticMailSink(db: MemberDb): MemberMailer {
  return { async send({ destination, kind, link }) {
    if (!/^[^@]+@example\.test$/.test(destination) || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(link)) throw new Error('synthetic_mail_only');
    await db.query('INSERT INTO member_local_mail(destination,kind,link) VALUES($1,$2,$3)', [destination, kind, link]);
  } };
}

import { randomUUID } from 'node:crypto';
import { provisionUserAccount } from '@/lib/mvp01/accounts';
import type { MemberDb, Row } from './db';
import type { MemberMailer } from './mail';
import type { CodeVerifier } from './verifier';
import { validEmail, validPassword, type Handoff } from './contract';
import { opaqueToken, passwordDigest, passwordMatches, tokenHash } from './security';

export const HANDOFF_MS = 15 * 60_000;
export const VERIFY_MS = 10 * 60_000;
export const RESET_MS = 15 * 60_000;
export type Member = { accountId: string; email: string; version: number };
export class MemberError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
type StoredHandoff = Row & { key_hash: string; payload: Handoff; expires_at: Date | string; verified_at: Date | string | null; claimed_by: string | null };
export class MemberService {
  constructor(public db: MemberDb, public secret: string, public origin: string, public mail: MemberMailer, public verifier: CodeVerifier, public clock = () => Date.now()) {}
  digest(value: string) { return tokenHash(value, this.secret); }
  async limit(subject: string, maximum = 30) {
    const now = new Date(this.clock()), expires = new Date(this.clock() + 15 * 60_000);
    const [row] = await this.db.query(`INSERT INTO member_rate_limits(key_hash,hits,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key_hash) DO UPDATE SET hits=CASE WHEN member_rate_limits.expires_at <= $3 THEN 1 ELSE member_rate_limits.hits+1 END,
      expires_at=CASE WHEN member_rate_limits.expires_at <= $3 THEN $2 ELSE member_rate_limits.expires_at END RETURNING hits`, [this.digest(subject), expires, now]);
    if (Number(row.hits) > maximum) throw new MemberError('try_later', 429);
  }
  async prepare(payload: Handoff) {
    const token = opaqueToken();
    await this.db.query('DELETE FROM member_pending_signups WHERE expires_at <= $1', [new Date(this.clock())]);
    await this.db.query('DELETE FROM member_handoffs WHERE expires_at <= $1', [new Date(this.clock())]);
    await this.db.query('DELETE FROM member_rate_limits WHERE expires_at <= $1', [new Date(this.clock())]);
    await this.db.query("DELETE FROM member_local_mail WHERE created_at < $1", [new Date(this.clock() - 60 * 60_000)]);
    await this.db.query('INSERT INTO member_handoffs(key_hash,payload,expires_at) VALUES($1,$2::jsonb,$3)', [this.digest(token), JSON.stringify(payload), new Date(this.clock() + HANDOFF_MS)]);
    return token;
  }
  async handoff(token: string | undefined, db = this.db, lock = false): Promise<StoredHandoff> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('handoff_unavailable');
    const [row] = await db.query<StoredHandoff>(`SELECT * FROM member_handoffs WHERE key_hash=$1 ${lock ? 'FOR UPDATE' : ''}`, [this.digest(token)]);
    if (!row || new Date(row.expires_at).getTime() <= this.clock()) throw new MemberError('handoff_unavailable');
    return row;
  }
  async requestVerification(cookie: string | undefined) {
    const h = await this.handoff(cookie);
    await this.limit(`verify:${h.payload.me}`, 5);
    if ((await this.db.query("SELECT 1 FROM member_challenges WHERE handoff_key=$1 AND kind='verify' AND consumed_at IS NULL AND prepared_at IS NOT NULL AND expires_at > $2", [h.key_hash, new Date(this.clock())])).length) return;
    const token = opaqueToken();
    await this.db.transaction(async db => {
      await db.query("UPDATE member_challenges SET consumed_at=$1 WHERE handoff_key=$2 AND kind='verify' AND consumed_at IS NULL", [new Date(this.clock()), h.key_hash]);
      await db.query("INSERT INTO member_challenges(token_hash,kind,handoff_key,expires_at) VALUES($1,'verify',$2,$3)", [this.digest(token), h.key_hash, new Date(this.clock() + VERIFY_MS)]);
    });
    await this.mail.send({ destination: h.payload.me, kind: 'verify', link: `${this.origin}/member/verify#token=${token}` });
    await this.db.query('UPDATE member_challenges SET prepared_at=$1 WHERE token_hash=$2', [new Date(this.clock()), this.digest(token)]);
  }
  async verifyEmail(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('link_unavailable');
    const next = opaqueToken();
    await this.db.transaction(async db => {
      const [challenge] = await db.query("SELECT * FROM member_challenges WHERE token_hash=$1 AND kind='verify' FOR UPDATE", [this.digest(token)]);
      if (!challenge || challenge.consumed_at || new Date(String(challenge.expires_at)).getTime() <= this.clock()) throw new MemberError('link_unavailable');
      const [h] = await db.query<StoredHandoff>('SELECT * FROM member_handoffs WHERE key_hash=$1 FOR UPDATE', [challenge.handoff_key]);
      if (!h || new Date(h.expires_at).getTime() <= this.clock() || h.claimed_by) throw new MemberError('link_unavailable');
      // Email proof rotates the handoff. Its original holder cannot choose the victim's password.
      await db.query('INSERT INTO member_handoffs(key_hash,payload,verified_at,expires_at) VALUES($1,$2::jsonb,$3,$4)', [this.digest(next), JSON.stringify(h.payload), new Date(this.clock()), new Date(this.clock() + HANDOFF_MS)]);
      await db.query('UPDATE member_pending_signups SET handoff_key=$1 WHERE handoff_key=$2', [this.digest(next), h.key_hash]);
      await db.query('UPDATE member_handoffs SET expires_at=$1 WHERE key_hash=$2', [new Date(this.clock()), h.key_hash]);
      await db.query('UPDATE member_challenges SET consumed_at=$1 WHERE token_hash=$2', [new Date(this.clock()), this.digest(token)]);
    });
    return next;
  }
  async credential(email: string, db = this.db) {
    const [row] = await db.query(`SELECT c.*, a.status FROM member_credentials c JOIN user_accounts a ON a.id=c.account_id WHERE c.email=$1`, [email]);
    return row;
  }
  async signIn(email: unknown, password: unknown, clientKey: string, proofCookie?: string): Promise<Member | null> {
    await this.limit(`login-ip:${clientKey}`, 60);
    if (!validEmail(email) || typeof password !== 'string' || password.length > 256) return null;
    const normalized = email.trim().toLowerCase();
    await this.limit(`login-email:${normalized}`, 20);
    const row = await this.credential(normalized);
    if (row) {
      const matches = passwordMatches(password, row.password_salt, row.password_hash);
      return matches && row.status === 'active' && row.email_verified_at ? { accountId: String(row.account_id), email: normalized, version: Number(row.auth_version) } : null;
    }
    let proof: StoredHandoff | undefined;
    if (proofCookie) {
      try { proof = await this.handoff(proofCookie); }
      catch (failure) { passwordMatches(password, undefined, undefined); throw failure; }
    }
    const pending = proof?.payload.me === normalized ? await this.pending(proof.key_hash) : undefined;
    const matches = passwordMatches(password, pending?.password_salt, pending?.password_hash);
    if (!matches || !pending || !proofCookie) return null;
    return this.completePending(normalized, proofCookie, String(pending.password_hash));
  }
  async pending(handoffKey: string, db = this.db) {
    const [row] = await db.query('SELECT * FROM member_pending_signups WHERE handoff_key=$1 AND expires_at > $2', [handoffKey, new Date(this.clock())]);
    return row;
  }
  private async completePending(email: string, cookie: string, passwordHash: string): Promise<Member> {
    return this.db.transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member:${email}`]);
      const h = await this.handoff(cookie, db, true);
      const [pending] = await db.query('SELECT * FROM member_pending_signups WHERE handoff_key=$1 AND expires_at > $2 FOR UPDATE', [h.key_hash, new Date(this.clock())]);
      if (!pending || pending.password_hash !== passwordHash || await this.credential(email, db)) throw new MemberError('sign_in_required', 409);
      if (!h.verified_at || h.payload.me !== email || h.claimed_by) throw new MemberError('email_verification_required', 403);
      const [existing] = await db.query('SELECT id FROM candidates WHERE email_normalized=$1 AND email_verified', [email]);
      const candidateId = existing ? String(existing.id) : randomUUID();
      if (existing && (await db.query('SELECT id FROM user_accounts WHERE candidate_id=$1', [candidateId])).length) throw new MemberError('sign_in_required', 409);
      if (!existing) await db.query('INSERT INTO candidates(id,name,email,email_verified,created_at,capture_channel) VALUES($1,$2,$3,true,$4,$5)', [candidateId, `${h.payload.mfn} ${h.payload.mln}`, email, new Date(this.clock()), 'versa_stub']);
      const accountSql = (parts: TemplateStringsArray, ...args: unknown[]) => db.query(parts.reduce((text, part, i) => text + part + (i < args.length ? `$${i + 1}` : ''), ''), args);
      const account = await provisionUserAccount(accountSql, candidateId, 'pending');
      await this.checkCode(h, account.id);
      await db.query('INSERT INTO member_credentials(account_id,email,password_salt,password_hash,email_verified_at) VALUES($1,$2,$3,$4,$5)', [account.id, email, pending.password_salt, pending.password_hash, new Date(this.clock())]);
      await this.claim(db, h, account.id);
      await db.query("UPDATE user_accounts SET status='active' WHERE id=$1 AND status='pending'", [account.id]);
      await db.query('DELETE FROM member_pending_signups WHERE handoff_key=$1', [h.key_hash]);
      return { accountId: account.id, email, version: 1 };
    });
  }
  async session(accountId: string, version: number): Promise<Member | null> {
    const [row] = await this.db.query(`SELECT c.*,a.status FROM member_credentials c JOIN user_accounts a ON a.id=c.account_id WHERE c.account_id=$1`, [accountId]);
    return row?.status === 'active' && row.email_verified_at && Number(row.auth_version) === version ? { accountId, email: String(row.email), version } : null;
  }
  private async checkCode(h: StoredHandoff, accountId: string) {
    if (!h.verified_at) throw new MemberError('email_verification_required', 403);
    if (!await this.verifier.check(h.payload.code, { userId: accountId, email: h.payload.me, emailConfirmed: true })) throw new MemberError('handoff_not_verified');
  }
  private async claim(db: MemberDb, h: StoredHandoff, accountId: string) {
    const codeDigest = this.digest(h.payload.code);
    await db.query('INSERT INTO member_code_claims(code_digest,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [codeDigest, accountId]);
    const [owner] = await db.query('SELECT account_id FROM member_code_claims WHERE code_digest=$1', [codeDigest]);
    if (owner?.account_id !== accountId) throw new MemberError('handoff_not_verified');
    await db.query(`INSERT INTO member_handoff_claims(handoff_key,account_id,code_digest,sponsor_first,sponsor_last,variable_data)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(handoff_key) DO NOTHING`, [h.key_hash, accountId, codeDigest, h.payload.sfn, h.payload.sln, JSON.stringify(h.payload.extra)]);
    await db.query('UPDATE member_handoffs SET claimed_by=$1 WHERE key_hash=$2', [accountId, h.key_hash]);
  }
  async signup(cookie: string | undefined, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm) throw new MemberError('password_invalid');
    const digest = passwordDigest(password);
    const incoming = await this.handoff(cookie);
    await this.limit(`signup:${incoming.payload.me}`, 10);
    await this.db.transaction(async db => {
      const h = await this.handoff(cookie, db, true);
      if (h.claimed_by) throw new MemberError('handoff_unavailable');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member:${h.payload.me}`]);
      // Each trusted handoff owns its pending password. No email-wide reservation,
      // no account-status-dependent response, and no overwrite on refresh/retry.
      await db.query('DELETE FROM member_pending_signups WHERE handoff_key=$1 AND expires_at <= $2', [h.key_hash, new Date(this.clock())]);
      await db.query('INSERT INTO member_pending_signups(handoff_key,email,password_salt,password_hash,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(handoff_key) DO NOTHING', [h.key_hash, h.payload.me, digest.salt, digest.hash, new Date(this.clock()+HANDOFF_MS*2)]);
    });
    await this.requestVerification(cookie);
  }
  async link(cookie: string | undefined, member: Member) {
    return this.db.transaction(async db => {
      const [account] = await db.query('SELECT c.auth_version,c.email,a.status FROM member_credentials c JOIN user_accounts a ON a.id=c.account_id WHERE c.account_id=$1 FOR UPDATE OF c,a', [member.accountId]);
      if (!account || account.status !== 'active' || Number(account.auth_version) !== member.version || account.email !== member.email) throw new MemberError('sign_in_required', 401);
      const h = await this.handoff(cookie, db, true);
      if (h.payload.me !== member.email || (h.claimed_by && h.claimed_by !== member.accountId)) throw new MemberError('handoff_not_verified');
      await this.checkCode(h, member.accountId);
      await this.claim(db, h, member.accountId);
    });
  }
  async forgot(email: unknown, cookie?: string) {
    if (!validEmail(email)) return;
    const normalized = email.trim().toLowerCase();
    await this.limit(`reset:${normalized}`, 5);
    const account = await this.credential(normalized);
    let pending: Row | undefined;
    try { const h = await this.handoff(cookie); if (!account && h.payload.me === normalized) pending = await this.pending(h.key_hash); } catch { /* Generic response for all states. */ }
    if ((!account && !pending) || account?.status === 'disabled') return;
    const token = opaqueToken();
    let handoffKey: string | null = null;
    try { const h = await this.handoff(cookie); if (h.payload.me === normalized) handoffKey = h.key_hash; } catch { /* Later account recovery does not require a handoff. */ }
    await this.db.transaction(async db => {
      await db.query("UPDATE member_challenges SET consumed_at=$1 WHERE (account_id=$2 OR (pending_email=$3 AND handoff_key=$4)) AND kind='reset' AND consumed_at IS NULL", [new Date(this.clock()), account?.account_id || null, pending ? normalized : null, handoffKey]);
      await db.query("INSERT INTO member_challenges(token_hash,kind,account_id,pending_email,handoff_key,expires_at) VALUES($1,'reset',$2,$3,$4,$5)", [this.digest(token), account?.account_id || null, pending ? normalized : null, handoffKey, new Date(this.clock() + RESET_MS)]);
    });
    await this.mail.send({ destination: normalized, kind: 'reset', link: `${this.origin}/member/reset#token=${token}` });
  }
  async reset(token: unknown, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('link_unavailable');
    const digest = passwordDigest(password);
    let nextCookie: string | undefined;
    await this.db.transaction(async db => {
      const [row] = await db.query("SELECT * FROM member_challenges WHERE token_hash=$1 AND kind='reset' FOR UPDATE", [this.digest(token)]);
      if (!row || row.consumed_at || new Date(String(row.expires_at)).getTime() <= this.clock()) throw new MemberError('link_unavailable');
      if (row.account_id) {
        const [updated] = await db.query(`UPDATE member_credentials SET password_salt=$1,password_hash=$2,auth_version=auth_version+1 WHERE account_id=$3
          AND EXISTS(SELECT 1 FROM user_accounts WHERE id=$3 AND status='active') RETURNING account_id`, [digest.salt, digest.hash, row.account_id]);
        if (!updated) throw new MemberError('link_unavailable');
      } else {
        const [updated] = await db.query('UPDATE member_pending_signups SET password_salt=$1,password_hash=$2 WHERE handoff_key=$3 AND email=$4 AND expires_at > $5 RETURNING email', [digest.salt, digest.hash, row.handoff_key, row.pending_email, new Date(this.clock())]);
        if (!updated) throw new MemberError('link_unavailable');
      }
      await db.query('UPDATE member_challenges SET consumed_at=$1 WHERE token_hash=$2', [new Date(this.clock()), this.digest(token)]);
      if (row.handoff_key) {
        const [h] = await db.query<StoredHandoff>('SELECT * FROM member_handoffs WHERE key_hash=$1 FOR UPDATE', [row.handoff_key]);
        const credential = row.pending_email ? { email: row.pending_email } : (await db.query('SELECT email FROM member_credentials WHERE account_id=$1', [row.account_id]))[0];
        if (h && !h.claimed_by && new Date(h.expires_at).getTime() > this.clock() && credential?.email === h.payload.me) {
          nextCookie = opaqueToken();
          await db.query('INSERT INTO member_handoffs(key_hash,payload,verified_at,expires_at) VALUES($1,$2::jsonb,$3,$4)', [this.digest(nextCookie), JSON.stringify(h.payload), new Date(this.clock()), new Date(this.clock()+HANDOFF_MS)]);
          await db.query('UPDATE member_pending_signups SET handoff_key=$1 WHERE handoff_key=$2', [this.digest(nextCookie), h.key_hash]);
          await db.query('UPDATE member_handoffs SET expires_at=$1 WHERE key_hash=$2', [new Date(this.clock()), h.key_hash]);
        }
      }
    });
    return nextCookie;
  }
  async expire(cookie: string | undefined) {
    if (cookie) await this.db.query('UPDATE member_handoffs SET expires_at=$1 WHERE key_hash=$2', [new Date(this.clock()), this.digest(cookie)]);
  }
  async logout(member: Member, cookie: string | undefined) {
    await this.db.query('UPDATE member_credentials SET auth_version=auth_version+1 WHERE account_id=$1 AND auth_version=$2', [member.accountId, member.version]);
    if (cookie) await this.db.query('UPDATE member_handoffs SET expires_at=$1 WHERE key_hash=$2', [new Date(this.clock()), this.digest(cookie)]);
  }
  async change(member: Member, current: unknown, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm || typeof current !== 'string' || current.length > 256) throw new MemberError('password_invalid');
    const digest = passwordDigest(password);
    await this.db.transaction(async db => {
      const [row] = await db.query('SELECT * FROM member_credentials WHERE account_id=$1 FOR UPDATE', [member.accountId]);
      if (!row || Number(row.auth_version) !== member.version || !passwordMatches(current, row.password_salt, row.password_hash)) throw new MemberError('password_invalid');
      await db.query('UPDATE member_credentials SET password_salt=$1,password_hash=$2,auth_version=auth_version+1 WHERE account_id=$3', [digest.salt, digest.hash, member.accountId]);
      await db.query("UPDATE member_challenges SET consumed_at=$1 WHERE account_id=$2 AND kind='reset' AND consumed_at IS NULL", [new Date(this.clock()), member.accountId]);
    });
  }
}

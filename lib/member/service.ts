import { randomUUID } from 'node:crypto';
import { memberWrite } from './writes';
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
  private async writeHandoff(db: MemberDb, action: string, key: string, data: Handoff | null=null, source: string | null=null, account: string | null=null, expires: number | null=null) {
    const proof=db.proof('handoff_'+action,{key,data,source,account,expires});
    const [row]=await db.query('SELECT public.member_write_handoff($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb) AS ok',[action,key,JSON.stringify(data),source,account,expires,JSON.stringify(proof)]);
    if (!row?.ok) throw new MemberError('handoff_unavailable');
  }
  private lookupChallenge(hash: string, kind: string, db=this.db) {
    return db.query('SELECT * FROM public.member_lookup_challenge($1,$2,$3::jsonb)',[hash,kind,JSON.stringify(db.proof('lookup_challenge',{hash,kind}))]);
  }
  async limit(subject: string, maximum = 30) {
    const now = new Date(this.clock()), expires = new Date(this.clock() + 15 * 60_000);
    const [row] = await this.db.query(`INSERT INTO member_rate_limits(key_hash,hits,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key_hash) DO UPDATE SET hits=CASE WHEN member_rate_limits.expires_at <= $3 THEN 1 ELSE member_rate_limits.hits+1 END,
      expires_at=CASE WHEN member_rate_limits.expires_at <= $3 THEN $2 ELSE member_rate_limits.expires_at END RETURNING hits`, [this.digest(subject), expires, now]);
    if (Number(row.hits) > maximum) throw new MemberError('try_later', 429);
  }
  async prepare(payload: Handoff) {
    const token = opaqueToken();
    await memberWrite(this.db,'prune_pending',{now:this.clock()});
    await this.db.query('DELETE FROM member_rate_limits WHERE expires_at <= $1', [new Date(this.clock())]);
    await this.db.query("DELETE FROM member_local_mail WHERE created_at < $1", [new Date(this.clock() - 60 * 60_000)]);
    await this.writeHandoff(this.db,'prepare',this.digest(token),payload,null,null,this.clock()+HANDOFF_MS);
    return token;
  }
  async handoff(token: string | undefined, db = this.db, lock = false): Promise<StoredHandoff> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('handoff_unavailable');
    const connection=db===this.db ? db.scope({handoffKey:this.digest(token)}) : db;
    void lock; // Immutable handoff rows are locked inside the proof-gated write function.
    const [row] = await connection.query<StoredHandoff>('SELECT * FROM member_handoffs WHERE key_hash=$1', [this.digest(token)]);
    if (!row || new Date(row.expires_at).getTime() <= this.clock()) throw new MemberError('handoff_unavailable');
    return row;
  }
  async requestVerification(cookie: string | undefined) {
    const h = await this.handoff(cookie);
    await this.limit(`verify:${h.payload.me}`, 5);
    if ((await this.db.scope({ email: h.payload.me }).query("SELECT 1 FROM member_challenges WHERE handoff_key=$1 AND kind='verify' AND consumed_at IS NULL AND prepared_at IS NOT NULL AND expires_at > $2", [h.key_hash, new Date(this.clock())])).length) return;
    const token = opaqueToken();
    await this.db.scope({ email: h.payload.me }).transaction(async db => {
      if (!await memberWrite(db,'create_challenge',{token:this.digest(token),kind:'verify',account:null,email:h.payload.me,handoff:h.key_hash,expires:this.clock()+VERIFY_MS})) throw new MemberError('link_unavailable');
    });
    await this.mail.send({ destination: h.payload.me, kind: 'verify', link: `${this.origin}/member/verify#token=${token}` });
    if (!await memberWrite(this.db,'prepare_challenge',{token:this.digest(token),kind:'verify'})) throw new MemberError('link_unavailable');
  }
  async verifyEmail(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('link_unavailable');
    const next = opaqueToken();
    const [target] = await this.lookupChallenge(this.digest(token),'verify');
    await this.db.scope({ email: target?.pending_email ? String(target.pending_email) : undefined }).transaction(async db => {
      const [challenge] = await this.lookupChallenge(this.digest(token),'verify',db);
      if (!challenge || challenge.consumed_at || new Date(String(challenge.expires_at)).getTime() <= this.clock()) throw new MemberError('link_unavailable');
      const [h] = await db.query<StoredHandoff>('SELECT * FROM member_handoffs WHERE key_hash=$1', [challenge.handoff_key]);
      if (!h || new Date(h.expires_at).getTime() <= this.clock() || h.claimed_by) throw new MemberError('link_unavailable');
      // Email proof rotates the handoff. Its original holder cannot choose the victim's password.
      await this.writeHandoff(db,'rotate',this.digest(next),null,h.key_hash,null,this.clock()+HANDOFF_MS);
      await memberWrite(db,'rekey_pending',{old:h.key_hash,new:this.digest(next)});
      if (!await memberWrite(db,'consume_challenge',{token:this.digest(token),kind:'verify'})) throw new MemberError('link_unavailable');
    });
    return next;
  }
  async credential(email: string): Promise<Row | undefined> {
    const [row] = await this.db.scope({ email }).query('SELECT * FROM member_credentials WHERE email=$1', [email]);
    if (!row) return undefined;
    const [account] = await this.db.scope({ accountId: String(row.account_id) }).query('SELECT status FROM user_accounts WHERE id=$1', [row.account_id]);
    return account ? { ...row, status: account.status } : undefined;
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
    const connection=db===this.db ? db.scope({handoffKey}) : db;
    const [row] = await connection.query('SELECT * FROM member_pending_signups WHERE handoff_key=$1 AND expires_at > $2', [handoffKey, new Date(this.clock())]);
    return row;
  }
  private async completePending(email: string, cookie: string, passwordHash: string): Promise<Member> {
    const [plannedCandidate] = await this.db.scope({ email }).query('SELECT id FROM candidates WHERE email_normalized=$1 AND email_verified', [email]);
    const candidateId = plannedCandidate ? String(plannedCandidate.id) : randomUUID();
    const accountId = randomUUID();
    return this.db.scope({ email, candidateId, accountId, handoffKey:this.digest(cookie) }).transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member:${email}`]);
      const h = await this.handoff(cookie, db, true);
      const [pending] = await db.query('SELECT * FROM member_pending_signups WHERE handoff_key=$1 AND expires_at > $2', [h.key_hash, new Date(this.clock())]);
      if (!pending || pending.password_hash !== passwordHash || (await db.query('SELECT 1 FROM member_credentials WHERE email=$1', [email])).length) throw new MemberError('sign_in_required', 409);
      if (!h.verified_at || h.payload.me !== email || h.claimed_by) throw new MemberError('email_verification_required', 403);
      const [existing] = await db.query('SELECT id FROM candidates WHERE email_normalized=$1 AND email_verified', [email]);
      // If another writer created the candidate after planning, retry with a fresh
      // scope rather than widening this transaction's identity.
      if (existing && String(existing.id) !== candidateId) throw new MemberError('sign_in_required', 409);
      if (!existing) await db.query('INSERT INTO candidates(id,name,email,email_verified,created_at,capture_channel) VALUES($1,$2,$3,true,$4,$5)', [candidateId, `${h.payload.mfn} ${h.payload.mln}`, email, new Date(this.clock()), 'versa_stub']);
      const [account] = await db.query('SELECT public.member_create_pending_account($1,$2,$3,$4,$5::jsonb) AS id', [accountId, candidateId, email,h.key_hash,JSON.stringify(db.proof('create_account',{account:accountId,candidate:candidateId,email,handoff:h.key_hash}))]);
      if (!account?.id) throw new MemberError('sign_in_required', 409);
      await this.checkCode(h, accountId);
      await this.claim(db, h, accountId);
      if (!await memberWrite(db,'create_credential',{account:accountId,email,salt:pending.password_salt,hash:pending.password_hash})) throw new MemberError('sign_in_required',409);
      const [activation] = await db.query('SELECT public.member_activate_account($1,$2,$3,$4::jsonb) AS activated', [accountId, candidateId,h.key_hash,JSON.stringify(db.proof('activate_account',{account:accountId,candidate:candidateId,handoff:h.key_hash}))]);
      if (!activation?.activated) throw new MemberError('sign_in_required',409);
      await memberWrite(db,'delete_pending',{handoff:h.key_hash});
      return { accountId, email, version: 1 };
    });
  }
  async session(accountId: string, version: number): Promise<Member | null> {
    const [row] = await this.db.scope({ accountId }).query(`SELECT c.*,a.status FROM member_credentials c JOIN user_accounts a ON a.id=c.account_id WHERE c.account_id=$1`, [accountId]);
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
    await this.writeHandoff(db,'claim',h.key_hash,null,null,accountId);
  }
  async signup(cookie: string | undefined, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm) throw new MemberError('password_invalid');
    const digest = passwordDigest(password);
    const incoming = await this.handoff(cookie);
    await this.limit(`signup:${incoming.payload.me}`, 10);
    await this.db.scope({email:incoming.payload.me,handoffKey:incoming.key_hash}).transaction(async db => {
      const h = await this.handoff(cookie, db, true);
      if (h.claimed_by) throw new MemberError('handoff_unavailable');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member:${h.payload.me}`]);
      // Each trusted handoff owns its pending password. No email-wide reservation,
      // no account-status-dependent response, and no overwrite on refresh/retry.
      if (!await this.pending(h.key_hash,db) && !await memberWrite(db,'stage_pending',{handoff:h.key_hash,email:h.payload.me,salt:digest.salt,hash:digest.hash,expires:this.clock()+HANDOFF_MS*2})) throw new MemberError('handoff_unavailable');
    });
    await this.requestVerification(cookie);
  }
  async link(cookie: string | undefined, member: Member) {
    return this.db.scope({ accountId: member.accountId,email:member.email }).transaction(async db => {
      const [account] = await db.query('SELECT c.auth_version,c.email,a.status FROM member_credentials c JOIN user_accounts a ON a.id=c.account_id WHERE c.account_id=$1', [member.accountId]);
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
    await this.db.scope({ email: normalized, accountId: account?.account_id ? String(account.account_id) : undefined }).transaction(async db => {
      if (!await memberWrite(db,'create_challenge',{token:this.digest(token),kind:'reset',account:account?.account_id || null,email:pending ? normalized : null,handoff:handoffKey,expires:this.clock()+RESET_MS})) throw new MemberError('link_unavailable');
    });
    await this.mail.send({ destination: normalized, kind: 'reset', link: `${this.origin}/member/reset#token=${token}` });
  }
  async reset(token: unknown, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new MemberError('link_unavailable');
    const digest = passwordDigest(password);
    let nextCookie: string | undefined;
    // The locked challenge is revalidated below; this immutable id only plans the
    // narrow account scope before SET LOCAL ROLE for an active-account reset.
    const [target] = await this.lookupChallenge(this.digest(token),'reset');
    await this.db.scope({ accountId: target?.account_id ? String(target.account_id) : undefined, email: target?.pending_email ? String(target.pending_email) : undefined }).transaction(async db => {
      const [row] = await this.lookupChallenge(this.digest(token),'reset',db);
      if (!row || row.consumed_at || new Date(String(row.expires_at)).getTime() <= this.clock()) throw new MemberError('link_unavailable');
      if (row.account_id) {
        const [credential]=await db.query('SELECT auth_version FROM member_credentials WHERE account_id=$1',[row.account_id]);
        if (!credential || !await memberWrite(db,'set_password',{account:row.account_id,salt:digest.salt,hash:digest.hash,version:Number(credential.auth_version)})) throw new MemberError('link_unavailable');
      } else {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`member:${row.pending_email}`]);
        const pending=await this.pending(String(row.handoff_key),db);
        if (!pending || pending.email!==row.pending_email || !await memberWrite(db,'stage_pending',{handoff:row.handoff_key,email:row.pending_email,salt:digest.salt,hash:digest.hash,expires:new Date(String(pending.expires_at)).getTime()})) throw new MemberError('link_unavailable');
      }
      if (!await memberWrite(db,'consume_challenge',{token:this.digest(token),kind:'reset'})) throw new MemberError('link_unavailable');
      if (row.handoff_key) {
        const [h] = await db.query<StoredHandoff>('SELECT * FROM member_handoffs WHERE key_hash=$1', [row.handoff_key]);
        const credential = row.pending_email ? { email: row.pending_email } : (await db.query('SELECT email FROM member_credentials WHERE account_id=$1', [row.account_id]))[0];
        if (h && !h.claimed_by && new Date(h.expires_at).getTime() > this.clock() && credential?.email === h.payload.me) {
          nextCookie = opaqueToken();
          await this.writeHandoff(db,'rotate',this.digest(nextCookie),null,h.key_hash,null,this.clock()+HANDOFF_MS);
          await memberWrite(db,'rekey_pending',{old:h.key_hash,new:this.digest(nextCookie)});
            }
      }
    });
    return nextCookie;
  }
  async expire(cookie: string | undefined) {
    if (cookie) await this.writeHandoff(this.db,'expire',this.digest(cookie));
  }
  async logout(member: Member, cookie: string | undefined) {
    await memberWrite(this.db,'bump_auth_version',{account:member.accountId,version:member.version});
    if (cookie) await this.writeHandoff(this.db,'expire',this.digest(cookie));
  }
  async change(member: Member, current: unknown, password: unknown, confirm: unknown) {
    if (!validPassword(password) || password !== confirm || typeof current !== 'string' || current.length > 256) throw new MemberError('password_invalid');
    const digest = passwordDigest(password);
    await this.db.scope({ accountId: member.accountId }).transaction(async db => {
      const [row] = await db.query('SELECT * FROM member_credentials WHERE account_id=$1', [member.accountId]);
      if (!row || Number(row.auth_version) !== member.version || !passwordMatches(current, row.password_salt, row.password_hash)) throw new MemberError('password_invalid');
      if (!await memberWrite(db,'set_password',{account:member.accountId,salt:digest.salt,hash:digest.hash,version:member.version})) throw new MemberError('password_invalid');
      const challenges=await db.query("SELECT token_hash FROM member_challenges WHERE account_id=$1 AND kind='reset' AND consumed_at IS NULL",[member.accountId]);
      for (const challenge of challenges) await memberWrite(db,'consume_challenge',{token:challenge.token_hash,kind:'reset'});
    });
  }
}

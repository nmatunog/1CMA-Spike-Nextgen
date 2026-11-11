import postgres from 'postgres';
import { generateOtpCode, hashDestination, hashOtp, isOtpDev, otpMatches, otpSecret, OTP_MAX_ATTEMPTS, OTP_TTL_MS, verifiedStillValid } from './otp.mjs';
let client: ReturnType<typeof postgres> | undefined;
type Candidate = { id: string; stage: string; consented?: boolean; email?: string };
type Citation = { id: string; version: string; source: string };
type TurnMeta = { action: string; intent?: string | null; reason?: string | null; citation?: Citation | null; outcome: string };
type Tx = {
  audit(c: Candidate, metadata: object): Promise<void>;
  suppressed(): Promise<boolean>;
  suppressIdentity(): Promise<void>;
  findCandidate(): Promise<Candidate | undefined>;
  createCandidate(input: { name: string; email: string }): Promise<Candidate>;
  consent(c: Candidate, notice: string): Promise<void>;
  optOut(c: Candidate): Promise<void>;
  handoff(c: Candidate, reason: string): Promise<postgres.Row>;
  book(c: Candidate, sessionId: string): Promise<postgres.Row>;
  listSessions(): Promise<postgres.Row[]>;
  findOpenBooking(c: Candidate): Promise<{ id: string; session_id: string } | undefined>;
  recordTurn(metadata: TurnMeta, messageText?: string | null): Promise<void>;
  issueOtp(): Promise<{ challengeId: string; expiresAt: Date; devCode?: string }>;
  verifyOtp(code: string): Promise<boolean>;
  otpVerified(): Promise<boolean>;
  ownStatus(c: Candidate): Promise<{ stage: string; bookingId: string | null; sessionId: string | null; handoffId: string | null }>;
};
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('database_unavailable');
  return client ||= postgres(process.env.DATABASE_URL, { max: 4, prepare: false });
}
export const repository = {
  async run(identity: string, fn: (tx: Tx) => Promise<unknown>) {
    return sql().begin<unknown>(async transaction => {
      // postgres TransactionSql omits its runtime tagged-template call signature.
      const t = transaction as typeof transaction & ((parts: TemplateStringsArray, ...values: unknown[]) => Promise<import("postgres").Row[]>);
      await t`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
      const event = async (id: string, kind: string, metadata = {}) => { await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${id},${kind},'gia',${t.json(metadata)})`; };
      const tx: Tx = {
        async audit(c: Candidate, metadata: object) { await event(c.id, 'gia.turn', metadata); },
        async suppressed() { return (await t`SELECT 1 FROM gia_suppressions WHERE identity=${identity} UNION ALL SELECT 1 FROM candidates c JOIN candidate_identities i ON i.candidate_id=c.id WHERE i.source='gia_web_session' AND i.external_id=${identity} AND c.stage='opt_out'`).length > 0; },
        async suppressIdentity() { await t`INSERT INTO gia_suppressions(identity) VALUES(${identity}) ON CONFLICT DO NOTHING`; },
        async findCandidate() {
          const rows = await t`SELECT c.*, EXISTS(SELECT 1 FROM candidate_consents s WHERE s.candidate_id=c.id AND s.source='gia_web_session' AND s.purpose='recruitment' AND s.revoked_at IS NULL) AS consented FROM candidates c JOIN candidate_identities i ON i.candidate_id=c.id WHERE i.source='gia_web_session' AND i.external_id=${identity} FOR UPDATE OF c`;
          return rows[0] as Candidate | undefined;
        },
        async createCandidate(input: { name: string; email: string }) {
          const [c] = await t`INSERT INTO candidates(name,email,phone,score) VALUES(${input.name},${input.email},'',0) RETURNING *`;
          await t`INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES('gia_web_session',${identity},${c.id})`;
          await event(c.id, 'candidate.created');
          return c as Candidate;
        },
        async consent(c: Candidate, notice: string) {
          const rows = await t`INSERT INTO candidate_consents(candidate_id,source,purpose,notice_version) VALUES(${c.id},'gia_web_session','recruitment',${notice}) ON CONFLICT DO NOTHING RETURNING candidate_id`;
          if (rows.length) await event(c.id, 'consent.granted', { notice });
        },
        async optOut(c: Candidate) {
          await t`UPDATE candidates SET stage='opt_out',next_action=NULL,due_at=NULL WHERE id=${c.id}`;
          await t`UPDATE candidate_consents SET revoked_at=now() WHERE candidate_id=${c.id} AND revoked_at IS NULL`;
          await t`UPDATE candidate_handoffs SET state='cancelled' WHERE candidate_id=${c.id} AND state='open'`;
          await t`INSERT INTO gia_suppressions(identity) VALUES(${identity}) ON CONFLICT DO NOTHING`;
          if (c.stage !== 'opt_out') await event(c.id, 'opt_out');
        },
        async handoff(c: Candidate, reason: string) {
          const inserted = await t`INSERT INTO candidate_handoffs(candidate_id,reason) VALUES(${c.id},${reason}) ON CONFLICT (candidate_id,reason) WHERE state IN ('open','acknowledged') DO NOTHING RETURNING id,due_at`;
          if (inserted.length) await event(c.id, 'handoff.created', { reason });
          const [h] = inserted.length ? inserted : await t`SELECT id,due_at FROM candidate_handoffs WHERE candidate_id=${c.id} AND reason=${reason} AND state IN ('open','acknowledged')`;
          return h;
        },
        async book(c: Candidate, sessionId: string) {
          const [s] = await t`SELECT * FROM fep_sessions WHERE id=${sessionId} FOR UPDATE`;
          if (!s || s.cancelled || new Date(s.starts_at) <= new Date()) throw new Error('session_unavailable');
          const existing = await t`SELECT id FROM fep_bookings WHERE candidate_id=${c.id} AND session_id=${sessionId}`;
          if (existing.length) return existing[0];
          const [count] = await t`SELECT count(*)::int AS n FROM fep_bookings WHERE session_id=${sessionId}`;
          if (count.n >= s.capacity) throw new Error('session_full');
          const [b] = await t`INSERT INTO fep_bookings(candidate_id,session_id) VALUES(${c.id},${sessionId}) RETURNING id`;
          await t`UPDATE candidates SET stage='fep_booked' WHERE id=${c.id} AND stage IN ('new_lead','contacted','not_now')`;
          await event(c.id, 'fep.booked', { sessionId });
          return b;
        },
        async listSessions() {
          return t`SELECT s.id,s.starts_at,GREATEST(s.capacity-count(b.id)::int,0) AS seats_left FROM fep_sessions s LEFT JOIN fep_bookings b ON b.session_id=s.id WHERE NOT s.cancelled AND s.starts_at > now() GROUP BY s.id ORDER BY s.starts_at LIMIT 20`;
        },
        async findOpenBooking(c: Candidate) {
          const rows = await t`SELECT b.id,b.session_id FROM fep_bookings b JOIN fep_sessions s ON s.id=b.session_id WHERE b.candidate_id=${c.id} AND NOT s.cancelled`;
          return rows[0] as { id: string; session_id: string } | undefined;
        },
        async recordTurn(metadata: TurnMeta, messageText = null as string | null) {
          const c = await tx.findCandidate();
          await t`INSERT INTO gia_turns(identity,candidate_id,action,intent,reason,citation,outcome,message_text) VALUES(${identity},${c?.id ?? null},${metadata.action},${metadata.intent || null},${metadata.reason || null},${metadata.citation ? t.json(metadata.citation) : null},${metadata.outcome},${messageText ?? null})`;
          if (c?.consented) await event(c.id, 'gia.turn', { action: metadata.action, intent: metadata.intent, reason: metadata.reason, citation: metadata.citation, outcome: metadata.outcome });
        },
        async issueOtp() {
          const c = await tx.findCandidate();
          if (!c?.email) throw new Error('verification_required');
          const code = generateOtpCode();
          const secret = otpSecret();
          const [row] = await t`INSERT INTO gia_otp_challenges(identity,destination_hash,channel,code_hash,expires_at) VALUES(${identity},${hashDestination(c.email, secret)},'email',${hashOtp(identity, code, secret)},${new Date(Date.now() + OTP_TTL_MS)}) RETURNING id,expires_at`;
          const issued: { challengeId: string; expiresAt: Date; devCode?: string } = { challengeId: row.id as string, expiresAt: row.expires_at as Date };
          if (isOtpDev()) issued.devCode = code;
          return issued;
        },
        async verifyOtp(code: string) {
          const rows = await t`SELECT * FROM gia_otp_challenges WHERE identity=${identity} AND verified_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
          const challenge = rows[0];
          if (!challenge) return false;
          const attempts = Number(challenge.attempts) + 1;
          await t`UPDATE gia_otp_challenges SET attempts=${attempts} WHERE id=${challenge.id}`;
          if (attempts > OTP_MAX_ATTEMPTS) return false;
          if (!otpMatches(identity, code, String(challenge.code_hash))) return false;
          await t`UPDATE gia_otp_challenges SET verified_at=now() WHERE id=${challenge.id}`;
          return true;
        },
        async otpVerified() {
          const rows = await t`SELECT verified_at FROM gia_otp_challenges WHERE identity=${identity} AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1`;
          return verifiedStillValid(rows[0]?.verified_at);
        },
        async ownStatus(c: Candidate) {
          const booking = await t`SELECT b.id,b.session_id FROM fep_bookings b WHERE b.candidate_id=${c.id} ORDER BY b.created_at DESC LIMIT 1`;
          const handoff = await t`SELECT id FROM candidate_handoffs WHERE candidate_id=${c.id} AND state IN ('open','acknowledged') ORDER BY created_at DESC LIMIT 1`;
          return {
            stage: c.stage,
            bookingId: booking[0]?.id ? String(booking[0].id) : null,
            sessionId: booking[0]?.session_id ? String(booking[0].session_id) : null,
            handoffId: handoff[0]?.id ? String(handoff[0].id) : null,
          };
        },
      };
      return fn(tx);
    });
  },
};
export async function listSessions() {
  return sql()`SELECT s.id,s.starts_at,GREATEST(s.capacity-count(b.id)::int,0) AS seats_left FROM fep_sessions s LEFT JOIN fep_bookings b ON b.session_id=s.id WHERE NOT s.cancelled AND s.starts_at > now() GROUP BY s.id ORDER BY s.starts_at LIMIT 20`;
}

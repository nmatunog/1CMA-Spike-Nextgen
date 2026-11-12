import postgres from 'postgres';
import { applyCandidateStop, identityIsSuppressed } from '@/lib/recruitment/suppression';
import { g1MayEmit, sanitizeEngagementMetadata } from './engagement.mjs';
import { HANDOFF_REASONS } from './workflow.mjs';
import { recordGiaVisitorEngagementOn, storeableMessageText } from '@/lib/mvp01/engage';
import type { GiaEngagementKind } from '@/lib/mvp01/interfaces';
import {
  generateOtpCode, hashClientKey, hashDestination, hashOtp, hashOtpThrottleKey, isOtpDev,
  otpSecret, OTP_MAX_ATTEMPTS, OTP_TTL_MS, planOtpIssue, planOtpVerify, rememberDevOtp,
  verifiedStillValid,
} from './otp.mjs';
let client: ReturnType<typeof postgres> | undefined;
type Candidate = { id: string; stage: string; consented?: boolean; email?: string };
type Citation = { id: string; version: string; source: string };
type TurnMeta = { action: string; intent?: string | null; reason?: string | null; citation?: Citation | null; outcome: string };
type OtpVerifyResult = { ok: boolean; locked: boolean };
type HandoffLearning = { resolution?: string | null; giaCouldAnswer?: boolean; generalAnswer?: string | null };
type HandoffExtras = { program?: string | null; consented?: boolean };
type Tx = {
  audit(c: Candidate, metadata: object): Promise<void>;
  suppressed(): Promise<boolean>;
  suppressIdentity(): Promise<void>;
  findCandidate(): Promise<Candidate | undefined>;
  createCandidate(input: { name: string; email: string }): Promise<Candidate>;
  consent(c: Candidate, notice: string): Promise<void>;
  optOut(c: Candidate): Promise<void>;
  handoff(c: Candidate, reason: string, learning?: HandoffLearning, extras?: HandoffExtras): Promise<postgres.Row>;
  handoffVisitor(input: { reason: string; program: string; consented: false; identity?: string }): Promise<postgres.Row>;
  book(c: Candidate, sessionId: string): Promise<postgres.Row>;
  listSessions(): Promise<postgres.Row[]>;
  findOpenBooking(c: Candidate): Promise<{ id: string; session_id: string } | undefined>;
  recordTurn(metadata: TurnMeta, messageText?: string | null): Promise<void>;
  recordEngagement(kind: string, metadata?: object): Promise<void>;
  issueOtp(clientHash?: string | null): Promise<{ challengeId: string; expiresAt: Date }>;
  verifyOtp(code: string): Promise<OtpVerifyResult>;
  otpVerified(): Promise<boolean>;
  ownStatus(c: Candidate): Promise<{ stage: string; bookingId: string | null; sessionId: string | null; handoffId: string | null }>;
};
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('database_unavailable');
  return client ||= postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
}
export { hashClientKey };
export const repository = {
  async run(identity: string, fn: (tx: Tx) => Promise<unknown>) {
    return sql().begin<unknown>(async transaction => {
      // postgres TransactionSql omits its runtime tagged-template call signature.
      const t = transaction as typeof transaction & ((parts: TemplateStringsArray, ...values: unknown[]) => Promise<import("postgres").Row[]>);
      await t`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
      const event = async (id: string, kind: string, metadata = {}) => { await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${id},${kind},'gia',${t.json(metadata)})`; };
      const bumpThrottle = async (keyHash: string) => {
        const rows = await t`SELECT * FROM gia_otp_throttle WHERE key_hash=${keyHash} FOR UPDATE`;
        const row = rows[0];
        const planned = planOtpIssue({
          lastIssuedAt: row?.last_issued_at as Date | undefined,
          windowCount: row?.window_count as number | undefined,
          windowStartedAt: row?.window_started_at as Date | undefined,
        });
        if (!planned.allowed) throw new Error('otp_throttled');
        const started = planned.windowStartedAt || new Date();
        if (row) await t`UPDATE gia_otp_throttle SET last_issued_at=now(), window_started_at=${started}, window_count=${planned.nextCount || 1} WHERE key_hash=${keyHash}`;
        else await t`INSERT INTO gia_otp_throttle(key_hash,last_issued_at,window_started_at,window_count) VALUES(${keyHash},now(),${started},${planned.nextCount || 1})`;
      };
      const findCandidate = async () => {
        const rows = await t`SELECT c.*, EXISTS(SELECT 1 FROM candidate_consents s WHERE s.candidate_id=c.id AND s.source='gia_web_session' AND s.purpose='recruitment' AND s.revoked_at IS NULL) AS consented FROM candidates c JOIN candidate_identities i ON i.candidate_id=c.id WHERE i.source='gia_web_session' AND i.external_id=${identity} FOR UPDATE OF c`;
        return rows[0] as Candidate | undefined;
      };
      return fn({
        async audit(c: Candidate, metadata: object) { await event(c.id, 'gia.turn', metadata); },
        async suppressed() { return identityIsSuppressed(t, identity); },
        async suppressIdentity() { await t`INSERT INTO gia_suppressions(identity) VALUES(${identity}) ON CONFLICT DO NOTHING`; },
        findCandidate,
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
          await applyCandidateStop(t, { candidateId: c.id, actor: 'gia', currentStage: c.stage, extraIdentities: [identity] });
        },
        async handoff(c: Candidate, reason: string, learning: HandoffLearning = {}, extras: HandoffExtras = {}) {
          const allowed = (HANDOFF_REASONS as readonly string[]).includes(reason) ? reason : 'unapproved_or_unknown';
          const giaCouldAnswer = learning.giaCouldAnswer === true;
          const generalAnswer = typeof learning.generalAnswer === 'string'
            ? storeableMessageText(learning.generalAnswer, null, allowed)
            : null;
          const resolution = typeof learning.resolution === 'string'
            ? (storeableMessageText(learning.resolution, null, allowed) ?? '')
            : '';
          const urgency = allowed === 'urgent' ? 'urgent' : 'normal';
          const consented = extras.consented !== false;
          const program = extras.program || null;
          const adopted = await t`UPDATE candidate_handoffs SET candidate_id=${c.id}, consented=true, program=COALESCE(${program}, program), visitor_identity=NULL, urgency=${urgency}, resolution=COALESCE(${resolution || null}, resolution), gia_could_answer=${giaCouldAnswer}, general_answer=COALESCE(${generalAnswer}, general_answer) WHERE visitor_identity=${identity} AND candidate_id IS NULL AND reason=${allowed} AND state IN ('open','acknowledged') RETURNING id,candidate_id,due_at,created_at,reason,urgency,consented,program,visitor_identity,resolution,gia_could_answer,general_answer`;
          if (adopted.length) {
            await event(c.id, 'handoff.created', { reason: allowed, gia_could_answer: giaCouldAnswer });
            return adopted[0];
          }
          const inserted = await t`INSERT INTO candidate_handoffs(candidate_id,reason,urgency,resolution,gia_could_answer,general_answer,consented,program,visitor_identity) VALUES(${c.id},${allowed},${urgency},${resolution || null},${giaCouldAnswer},${generalAnswer},${consented},${program},${null}) ON CONFLICT (candidate_id,reason) WHERE state IN ('open','acknowledged') DO NOTHING RETURNING id,candidate_id,due_at,created_at,reason,urgency,consented,program,visitor_identity,resolution,gia_could_answer,general_answer`;
          if (inserted.length) await event(c.id, 'handoff.created', { reason: allowed, gia_could_answer: giaCouldAnswer });
          const [h] = inserted.length ? inserted : await t`SELECT id,candidate_id,due_at,created_at,reason,urgency,consented,program,visitor_identity,resolution,gia_could_answer,general_answer FROM candidate_handoffs WHERE candidate_id=${c.id} AND reason=${allowed} AND state IN ('open','acknowledged')`;
          return h;
        },
        async handoffVisitor(input: { reason: string; program: string; consented: false; identity?: string }) {
          const allowed = (HANDOFF_REASONS as readonly string[]).includes(input.reason) ? input.reason : 'urgent';
          const program = input.program || null;
          const visitor = input.identity || identity;
          const inserted = await t`INSERT INTO candidate_handoffs(candidate_id,reason,urgency,resolution,gia_could_answer,general_answer,consented,program,visitor_identity) VALUES(${null},${allowed},'urgent',${null},${false},${null},${false},${program},${visitor}) ON CONFLICT (visitor_identity, reason) WHERE state IN ('open','acknowledged') AND visitor_identity IS NOT NULL AND consented = false DO NOTHING RETURNING id,candidate_id,due_at,created_at,reason,urgency,consented,program,visitor_identity`;
          const [h] = inserted.length ? inserted : await t`SELECT id,candidate_id,due_at,created_at,reason,urgency,consented,program,visitor_identity FROM candidate_handoffs WHERE visitor_identity=${visitor} AND reason=${allowed} AND state IN ('open','acknowledged')`;
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
          await recordGiaVisitorEngagementOn(t, {
            candidateId: c.id,
            kind: 'fep.booked',
            actor: 'gia',
            metadata: { intent: 'book_fep' },
          });
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
          const c = await findCandidate();
          const reason = (HANDOFF_REASONS as readonly string[]).includes(metadata.reason || '') ? metadata.reason : null;
          await t`INSERT INTO gia_turns(identity,candidate_id,action,intent,reason,citation,outcome,message_text) VALUES(${identity},${c?.id ?? null},${metadata.action},${metadata.intent || null},${reason},${metadata.citation ? t.json(metadata.citation) : null},${metadata.outcome},${messageText ?? null})`;
          if (c?.consented) await event(c.id, 'gia.turn', { action: metadata.action, intent: metadata.intent, reason, citation: metadata.citation, outcome: metadata.outcome });
        },
        async recordEngagement(kind: string, metadata: object = {}) {
          const c = await findCandidate();
          if (!c) return;
          if (!g1MayEmit(kind)) return;
          if (kind === 'fep.booked' || kind === 'gia.handoff') {
            const prior = await t`SELECT 1 FROM candidate_events WHERE candidate_id=${c.id} AND kind=${kind} LIMIT 1`;
            if (prior.length) return;
          }
          await recordGiaVisitorEngagementOn(t, {
            candidateId: c.id,
            kind: kind as GiaEngagementKind,
            actor: 'gia',
            metadata: sanitizeEngagementMetadata(metadata),
          });
        },
        async issueOtp(clientHash = null as string | null) {
          const c = await findCandidate();
          if (!c?.email) throw new Error('verification_required');
          const open = await t`SELECT id,expires_at,attempts FROM gia_otp_challenges WHERE identity=${identity} AND verified_at IS NULL AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS} ORDER BY created_at DESC LIMIT 1`;
          if (open[0]) return { challengeId: String(open[0].id), expiresAt: open[0].expires_at as Date };
          const secret = otpSecret();
          await bumpThrottle(hashOtpThrottleKey('identity', identity, secret));
          if (clientHash) await bumpThrottle(hashOtpThrottleKey('client', clientHash, secret));
          const code = generateOtpCode();
          const [row] = await t`INSERT INTO gia_otp_challenges(identity,destination_hash,channel,code_hash,expires_at,client_hash) VALUES(${identity},${hashDestination(c.email, secret)},'email',${hashOtp(identity, code, secret)},${new Date(Date.now() + OTP_TTL_MS)},${clientHash}) RETURNING id,expires_at`;
          if (isOtpDev()) rememberDevOtp(identity, code);
          return { challengeId: row.id as string, expiresAt: row.expires_at as Date };
        },
        async verifyOtp(code: string) {
          const rows = await t`SELECT * FROM gia_otp_challenges WHERE identity=${identity} AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
          const challenge = rows[0];
          if (!challenge) return { ok: false, locked: false };
          if (new Date(String(challenge.expires_at)).getTime() <= Date.now()) return { ok: false, locked: false };
          const planned = planOtpVerify({ priorAttempts: challenge.attempts, codeHash: String(challenge.code_hash), identity, code });
          await t`UPDATE gia_otp_challenges SET attempts=${planned.attempts} WHERE id=${challenge.id}`;
          if (!planned.ok) return { ok: false, locked: planned.locked };
          await t`UPDATE gia_otp_challenges SET verified_at=now() WHERE id=${challenge.id}`;
          return { ok: true, locked: false };
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
      });
    });
  },
};
export async function listSessions() {
  return sql()`SELECT s.id,s.starts_at,GREATEST(s.capacity-count(b.id)::int,0) AS seats_left FROM fep_sessions s LEFT JOIN fep_bookings b ON b.session_id=s.id WHERE NOT s.cancelled AND s.starts_at > now() GROUP BY s.id ORDER BY s.starts_at LIMIT 20`;
}

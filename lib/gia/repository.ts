import postgres from 'postgres';
import { applyCandidateStop, identityIsSuppressed } from '@/lib/recruitment/suppression';
let client: ReturnType<typeof postgres> | undefined;
type Candidate = { id: string; stage: string; consented?: boolean };
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
};
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('database_unavailable');
  return client ||= postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
}
export const repository = {
  async run(identity: string, fn: (tx: Tx) => Promise<unknown>) {
    return sql().begin<unknown>(async transaction => {
      // postgres TransactionSql omits its runtime tagged-template call signature.
      const t = transaction as typeof transaction & ((parts: TemplateStringsArray, ...values: unknown[]) => Promise<import("postgres").Row[]>);
      await t`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
      const event = async (id: string, kind: string, metadata = {}) => { await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${id},${kind},'gia',${t.json(metadata)})`; };
      return fn({
        async audit(c: Candidate, metadata: object) { await event(c.id, 'gia.turn', metadata); },
        async suppressed() { return identityIsSuppressed(t, identity); },
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
          await applyCandidateStop(t, { candidateId: c.id, actor: 'gia', currentStage: c.stage, extraIdentities: [identity] });
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
      });
    });
  },
};
export async function listSessions() {
  return sql()`SELECT s.id,s.starts_at,GREATEST(s.capacity-count(b.id)::int,0) AS seats_left FROM fep_sessions s LEFT JOIN fep_bookings b ON b.session_id=s.id WHERE NOT s.cancelled AND s.starts_at > now() GROUP BY s.id ORDER BY s.starts_at LIMIT 20`;
}

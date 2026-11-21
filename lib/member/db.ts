import postgres from 'postgres';
import { NODE_POSTGRES_OPTIONS } from '@/lib/db/postgres-options';
import { signDbProof, type DbProof } from './db-proof';
export type Row = Record<string, unknown>;
export type MemberScope = { email?: string; accountId?: string; candidateId?: string; handoffKey?: string };
export const SCOPE_SQL = "SELECT set_config('app.member_email',$1,true),set_config('app.member_account_id',$2,true),set_config('app.member_candidate_id',$3,true),set_config('app.member_handoff_key',$4,true)";
export interface MemberDb {
  query<T extends Row = Row>(text: string, args?: unknown[]): Promise<T[]>;
  transaction<T>(work: (db: MemberDb) => Promise<T>): Promise<T>;
  scope(identity: MemberScope): MemberDb;
  proof(action: string, claims: Record<string, unknown>): DbProof;
}
export function memberDb(): MemberDb {
  const url=process.env.MEMBER_DATABASE_URL || '';
  if (!url || new URL(url).username !== 'member_runtime' || !/^[a-f0-9]{64}$/.test(process.env.MEMBER_DB_PROOF_SECRET || '')) throw new Error('member_storage_unconfigured');
  const key=process.env.MEMBER_DB_PROOF_SECRET || '';
  const proof=(action:string,claims:Record<string,unknown>)=>signDbProof(key,action,claims);
  const wrap = (client: ReturnType<typeof postgres>): MemberDb => ({
    proof,
    scope() { throw new Error('cannot_rescope_active_member_transaction'); },
    async query<T extends Row>(text: string, args: unknown[] = []) {
      // postgres.js otherwise JSON-encodes an already serialized JSON string a second time.
      const jsonParameters = new Set([...text.matchAll(/\$(\d+)::jsonb/g)].map(match => Number(match[1]) - 1));
      const parameters = args.map((value, index) => jsonParameters.has(index) ? client.json(JSON.parse(String(value))) : value);
      return [...await client.unsafe(text, parameters as never[])] as unknown as T[];
    },
    async transaction<T>(work: (db: MemberDb) => Promise<T>) {
      return client.begin(async transaction => work(wrap(transaction as unknown as ReturnType<typeof postgres>))) as Promise<T>;
    },
  });
  // Each operation gets a transaction-local role; never change a pooled connection's
  // session role or grant member storage to the existing GIA application identity.
  function scoped(identity: MemberScope = {}): MemberDb {
    const transaction = async <T>(work: (db: MemberDb) => Promise<T>): Promise<T> => {
      // A fresh client belongs only to this awaited operation/transaction. Closing
      // before returning prevents a later Worker request from reusing its socket.
      const client=postgres(url,NODE_POSTGRES_OPTIONS);
      try {return await client.begin(async connection => {
      const [login]=await connection.unsafe(`SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,
        EXISTS(SELECT 1 FROM pg_roles base WHERE base.rolname='member_app' AND (base.rolsuper OR base.rolbypassrls OR base.rolcreaterole OR base.rolcreatedb OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=base.oid))) AS unsafe_base,
        EXISTS(SELECT 1 FROM pg_class c WHERE pg_has_role(r.oid,c.relowner,'MEMBER') AND c.relnamespace IN ('public'::regnamespace,'member_private'::regnamespace)) OR EXISTS(SELECT 1 FROM pg_proc f WHERE pg_has_role(r.oid,f.proowner,'MEMBER') AND f.pronamespace IN ('public'::regnamespace,'member_private'::regnamespace)) AS owns,
        (SELECT array_agg(parent.rolname::text ORDER BY parent.rolname) FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid) AS memberships
        FROM pg_roles r WHERE r.rolname=session_user`);
      if (!login || login.rolname!=='member_runtime' || !login.rolcanlogin || login.unsafe_base || login.rolsuper || login.rolbypassrls || login.rolcreaterole || login.rolcreatedb || login.owns || JSON.stringify(login.memberships)!==JSON.stringify(['member_app'])) throw new Error('member_login_unrestricted');
      // Bind trusted request identity before dropping privileges. Clear missing values
      // too: no transaction may inherit another request's scope from the pool.
      await connection.unsafe(SCOPE_SQL, [identity.email || '', identity.accountId || '', identity.candidateId || '',identity.handoffKey || '']);
      await connection.unsafe('SET LOCAL ROLE member_app');
      return work(wrap(connection as unknown as ReturnType<typeof postgres>));
    }) as T;} finally {await client.end({timeout:1});}
    };
    return { query: (text, args) => transaction(db => db.query(text, args)), transaction, scope: scoped, proof };
  }
  return scoped();
}

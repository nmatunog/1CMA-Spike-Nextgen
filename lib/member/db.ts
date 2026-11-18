import { sql } from '@/lib/gia/repository';
export type Row = Record<string, unknown>;
export type MemberScope = { email?: string; accountId?: string; candidateId?: string };
export const SCOPE_SQL = "SELECT set_config('app.member_email',$1,true),set_config('app.member_account_id',$2,true),set_config('app.member_candidate_id',$3,true)";
export interface MemberDb {
  query<T extends Row = Row>(text: string, args?: unknown[]): Promise<T[]>;
  transaction<T>(work: (db: MemberDb) => Promise<T>): Promise<T>;
  scope(identity: MemberScope): MemberDb;
}
export function memberDb(): MemberDb {
  const wrap = (client: ReturnType<typeof sql>): MemberDb => ({
    scope() { throw new Error('cannot_rescope_active_member_transaction'); },
    async query<T extends Row>(text: string, args: unknown[] = []) {
      // postgres.js otherwise JSON-encodes an already serialized JSON string a second time.
      const jsonParameters = new Set([...text.matchAll(/\$(\d+)::jsonb/g)].map(match => Number(match[1]) - 1));
      const parameters = args.map((value, index) => jsonParameters.has(index) ? client.json(JSON.parse(String(value))) : value);
      return [...await client.unsafe(text, parameters as never[])] as unknown as T[];
    },
    async transaction<T>(work: (db: MemberDb) => Promise<T>) {
      return client.begin(async transaction => work(wrap(transaction as unknown as ReturnType<typeof sql>))) as Promise<T>;
    },
  });
  // Each operation gets a transaction-local role; never change a pooled connection's
  // session role or grant member storage to the existing GIA application identity.
  const client = sql();
  function scoped(identity: MemberScope = {}): MemberDb {
    const transaction = async <T>(work: (db: MemberDb) => Promise<T>): Promise<T> => client.begin(async connection => {
      // Bind trusted request identity before dropping privileges. Clear missing values
      // too: no transaction may inherit another request's scope from the pool.
      await connection.unsafe(SCOPE_SQL, [identity.email || '', identity.accountId || '', identity.candidateId || '']);
      await connection.unsafe('SET LOCAL ROLE member_app');
      return work(wrap(connection as unknown as ReturnType<typeof sql>));
    }) as Promise<T>;
    return { query: (text, args) => transaction(db => db.query(text, args)), transaction, scope: scoped };
  }
  return scoped();
}

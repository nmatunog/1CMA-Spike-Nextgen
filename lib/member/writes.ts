import type { MemberDb } from './db';
const fields = {
  create_credential: ['account','email','salt','hash'],
  set_password: ['account','salt','hash','version'],
  bump_auth_version: ['account','version'],
  stage_pending: ['handoff','email','salt','hash','expires'],
  delete_pending: ['handoff'],
  prune_pending: ['now'],
  rekey_pending: ['old','new'],
  create_challenge: ['token','kind','account','email','handoff','expires'],
  consume_challenge: ['token','kind'],
  prepare_challenge: ['token','kind'],
} as const;
/** Fixed internal operations only. Claims (including nulls) exactly mirror SQL. */
export async function memberWrite(db: MemberDb, action: keyof typeof fields, claims: Record<string, unknown>): Promise<boolean> {
  const keys=fields[action];
  if (Object.keys(claims).length!==keys.length || keys.some(key=>!Object.hasOwn(claims,key)||claims[key]===undefined)) throw new Error('invalid_member_write_claims');
  const args: unknown[]=keys.map(key=>claims[key]);
  args.push(JSON.stringify(db.proof(action,claims)));
  const params=keys.map((_,i)=>`$${i+1}`).concat(`$${args.length}::jsonb`).join(',');
  const [row]=await db.query(`SELECT public.member_${action}(${params}) AS ok`,args);
  return row?.ok===true;
}

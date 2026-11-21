import { createHmac, randomBytes } from 'node:crypto';
export type DbProof = { message: string; mac: string };
/** Never expose this proof, its key or SQL parameters to clients or logs. */
export function signDbProof(secret: string, action: string, claims: Record<string, unknown>): DbProof {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('member_proof_key_unavailable');
  const message=JSON.stringify({action,...claims,exp:Date.now()+60_000,nonce:randomBytes(32).toString('hex')});
  return {message,mac:createHmac('sha256',Buffer.from(secret,'hex')).update(message).digest('hex')};
}

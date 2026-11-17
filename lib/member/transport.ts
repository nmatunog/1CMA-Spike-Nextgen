import { createHmac, timingSafeEqual } from 'node:crypto';
import { opaqueToken } from './security';
import { parseHandoff, type Handoff } from './contract';
import { MemberError, type MemberService } from './service';
import { syntheticCodeFormat, type CodeFormat } from './code-format';

export const TICKET_MS = 5 * 60_000;
function mac(secret: string, input: string) { return createHmac('sha256', secret).update(input).digest('hex'); }
function matches(actual: string, expected: string) { return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')); }
export function issuerSignature(secret: string, timestamp: string, nonce: string, body: string) {
  return mac(secret, `versa-issuer-v1\n${timestamp}\n${nonce}\n${body}`);
}
/** Server-to-server authentication. Never log the body, signature, nonce or ticket. */
export function authenticatedPayload(secret: string, headers: Headers, body: string, now: number, format: CodeFormat = syntheticCodeFormat): { payload: Handoff; nonce: string } {
  const timestamp = headers.get('x-versa-timestamp') || '', nonce = headers.get('x-versa-nonce') || '';
  if (secret.length < 32 || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(nonce) || Math.abs(now - Number(timestamp)*1000) > 120_000 || !matches(headers.get('x-versa-signature') || '', issuerSignature(secret, timestamp, nonce, body))) throw new MemberError('handoff_unavailable');
  const data = JSON.parse(body);
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.values(data).some(value => typeof value !== 'string')) throw new MemberError('handoff_unavailable');
  // Detect duplicate JSON keys before JSON.parse can silently select a later identity.
  const tokens = body.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g) || [];
  const keys = tokens.filter((_, index) => tokens[index+1] === ':').map(key => JSON.parse(key));
  if (new Set(keys).size !== keys.length) throw new MemberError('handoff_unavailable');
  return { payload: parseHandoff(new URLSearchParams(data), format), nonce };
}
export async function issueTicket(service: MemberService, payload: Handoff, nonce: string) {
  const id = opaqueToken(), expires = service.clock() + TICKET_MS;
  const value = `${id}.${expires}`;
  const ticket = `${value}.${mac(service.secret, `versa-ticket-v1:${value}`)}`;
  await service.db.query('DELETE FROM member_arrival_tickets WHERE expires_at <= $1', [new Date(service.clock())]);
  await service.db.query('INSERT INTO member_arrival_tickets(ticket_hash,issuer_nonce,payload,expires_at) VALUES($1,$2,$3::jsonb,$4)', [service.digest(ticket), service.digest(`issuer:${nonce}`), JSON.stringify(payload), new Date(expires)]);
  return ticket;
}
export async function consumeTicket(service: MemberService, ticket: string) {
  const match = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/.exec(ticket);
  if (!match || Number(match[2]) <= service.clock() || Number(match[2]) > service.clock()+TICKET_MS || !matches(match[3], mac(service.secret, `versa-ticket-v1:${match[1]}.${match[2]}`))) throw new MemberError('handoff_unavailable');
  // UPDATE ... RETURNING is atomic: refresh, parallel requests and replay cannot reuse it.
  const [row] = await service.db.query("UPDATE member_arrival_tickets SET consumed_at=$1 WHERE ticket_hash=$2 AND consumed_at IS NULL AND expires_at > $1 RETURNING payload", [new Date(service.clock()), service.digest(ticket)]);
  if (!row) throw new MemberError('handoff_unavailable');
  return service.prepare(row.payload as Handoff);
}

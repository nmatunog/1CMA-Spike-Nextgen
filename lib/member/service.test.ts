import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '@/lib/gia/apply-migrations.mjs';
import { MemberError, MemberService, HANDOFF_MS, RESET_MS, VERIFY_MS } from './service';
import { parseHandoff, validPassword } from './contract';
import { syntheticMailSink } from './mail';
import { syntheticVerifier } from './verifier';
import { randomBytes, randomUUID } from 'node:crypto';
import { authenticatedPayload, consumeTicket, issueTicket, issuerSignature, TICKET_MS } from './transport';
import { passwordMatches } from './security';
import { signDbProof } from './db-proof';
import { SCOPE_SQL, type MemberDb, type MemberScope, type Row } from './db';

const PROOF_KEY='ab'.repeat(32);
const SECRET = 'synthetic-member-test-secret-only-123456789';
const ORIGIN = 'http://127.0.0.1:3002';
const PASSWORD = 'Synthetic-pass-8!';
let db: PGlite, port: MemberDb, service: MemberService;
let clock = Date.now();
function adapter(client: PGlite): MemberDb {
  return {
    proof: (action,claims)=>signDbProof(PROOF_KEY,action,claims),
    scope(identity: MemberScope) {
      const transaction = async <T>(work: (connection: MemberDb) => Promise<T>) => client.transaction(async tx => {
        await tx.query(SCOPE_SQL, [identity.email || '', identity.accountId || '', identity.candidateId || '',identity.handoffKey || '']);
        await tx.exec('SET LOCAL ROLE member_app');
        return work(adapter(tx as unknown as PGlite));
      });
      return { query: (text, args) => transaction(db => db.query(text, args)), transaction, proof:(action,claims)=>signDbProof(PROOF_KEY,action,claims), scope: (next: MemberScope) => adapter(client).scope(next) };
    },
    async query<T extends Row>(sql: string, args: unknown[] = []) {
      if (sql.includes('pg_advisory_xact_lock')) return [] as T[];
      return (await client.query<T>(sql, args)).rows;
    },
    async transaction<T>(work: (connection: MemberDb) => Promise<T>) { return client.transaction(tx => work(adapter(tx as unknown as PGlite))); },
  };
}
function fields(overrides: Record<string, string | undefined> = {}) {
  const clean = Object.fromEntries(Object.entries(overrides).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  return parseHandoff(new URLSearchParams({ mfn: 'Demo', mln: 'Member', me: 'demo@example.test', sfn: 'Test', sln: 'Sponsor', code: 'FREE-SYN00001', campaign: 'synthetic-only', role: 'admin', ...clean }));
}
async function emailLink(email = 'demo@example.test', kind = 'verify') {
  const [row] = await port.query('SELECT link FROM member_local_mail WHERE destination=$1 AND kind=$2 ORDER BY created_at DESC,id DESC LIMIT 1', [email, kind]);
  return new URLSearchParams(new URL(String(row.link)).hash.slice(1)).get('token')!;
}
async function verified(overrides: Record<string, string> = {}) {
  const h = await service.prepare(fields(overrides));
  await service.requestVerification(h);
  return { original: h, cookie: await service.verifyEmail(await emailLink(overrides.me)) };
}
async function active(overrides: Record<string, string> = {}) {
  const original = await service.prepare(fields(overrides));
  await service.signup(original, PASSWORD, PASSWORD);
  const cookie = await service.verifyEmail(await emailLink(overrides.me));
  const member = await service.signIn(overrides.me || 'demo@example.test', PASSWORD, 'local', cookie);
  if (!member) throw new Error('synthetic_activation_failed');
  return { original, cookie, id: member.accountId, member };
}

beforeAll(async () => {
  db = new PGlite(); port = adapter(db);
  await db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL DEFAULT \'\',phone text NOT NULL DEFAULT \'\',score integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());');
  await applyAllMigrations((sql: string) => db.exec(sql));
  await db.query('INSERT INTO member_private.proof_keys(id,secret) VALUES(true,$1)',[PROOF_KEY]);
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await resetWorkflowTables((sql: string) => db.exec(sql), WORKFLOW_RESET_TABLES);
  await db.exec('TRUNCATE member_local_mail,member_rate_limits,member_pending_signups,member_arrival_tickets,member_private.used_proofs');
  clock = Date.now();
  const { verifier } = await syntheticVerifier(SECRET);
  service = new MemberService(port, SECRET, ORIGIN, syntheticMailSink(port), verifier, () => clock);
});

describe('Versa member contract and escaping boundary', () => {
  it('accepts six lowercase fields and bounded extra variable data without interpreting roles', () => {
    const data = fields();
    expect(data.extra).toEqual({ campaign: 'synthetic-only', role: 'admin' });
    expect(Object.hasOwn(data, 'role')).toBe(false);
  });
  it.each(['mfn', 'mln', 'me', 'sfn', 'sln', 'code'])('rejects missing %s', field => {
    const { extra, ...base } = fields(); void extra;
    const params = new URLSearchParams(base); params.delete(field);
    expect(() => parseHandoff(params)).toThrow('invalid_handoff');
  });
  it.each([
    'me=other%40example.test', 'code=FREE-SYN00006', 'campaign=duplicate',
    'Me=other%40example.test', '__proto__=polluted', 'constructor=bad', 'password=not-accepted',
  ])('rejects ambiguous or credential-shaped extras: %s', suffix => {
    const data = fields(); const params = new URLSearchParams({ ...data, extra: '' } as unknown as Record<string, string>); params.delete('extra'); params.set('campaign','synthetic-only');
    for (const [k,v] of new URLSearchParams(suffix)) params.append(k,v);
    expect(() => parseHandoff(params)).toThrow('invalid_handoff');
  });
  it.each([{ me: 'not-an-email' }, { code: '000000000' }, { mfn: 'x'.repeat(81) }, { sfn: 'test\nname' }, { extraValue: 'x'.repeat(513) }])('rejects invalid/capped inputs %j', overrides => {
    expect(() => fields(overrides)).toThrow('invalid_handoff');
  });
  it('keeps HTML as text for React escaping, never HTML execution', () => {
    expect(fields({ mfn: '<img src=x onerror=alert(1)>' }).mfn).toContain('<img');
  });
  it('requires eight actual characters and matching bounded passwords', () => {
    expect(validPassword('1234567')).toBe(false); expect(validPassword('12345678')).toBe(true);
    expect(validPassword('😀😀😀😀')).toBe(false); expect(validPassword('😀'.repeat(8))).toBe(true);
    expect(validPassword('x'.repeat(257))).toBe(false);
  });
});

describe('email ownership and canonical account activation', () => {
  it('GET-style preparation creates no accounts, candidate, redemption, or entitlement', async () => {
    const cookie = await service.prepare(fields());
    expect((await service.handoff(cookie)).payload.extra.role).toBe('admin');
    for (const table of ['user_accounts', 'candidates', 'member_credentials', 'program_enrollments', 'program_roles']) expect(await port.query(`SELECT 1 FROM ${table}`)).toHaveLength(0);
  });
  it('stages a hashed signup without activating or linking an account before email proof', async () => {
    const cookie = await service.prepare(fields());
    await service.signup(cookie, PASSWORD, PASSWORD);
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
    expect(await port.query('SELECT 1 FROM candidates')).toHaveLength(0);
    expect(await service.signIn('demo@example.test', PASSWORD, 'local')).toBeNull();
    await expect(service.signIn('demo@example.test', PASSWORD, 'local', cookie)).rejects.toThrow('email_verification_required');
  });
  it('rejects short and mismatched password setup', async () => {
    const cookie = await service.prepare(fields());
    await expect(service.signup(cookie, 'short', 'short')).rejects.toThrow('password_invalid');
    await expect(service.signup(cookie, PASSWORD, 'different')).rejects.toThrow('password_invalid');
    expect(await port.query('SELECT 1 FROM member_pending_signups')).toHaveLength(0);
  });
  it('rotates proof to the email holder; the original requester cannot pre-hijack the account', async () => {
    const original = await service.prepare(fields()); await service.signup(original, PASSWORD, PASSWORD);
    const cookie = await service.verifyEmail(await emailLink());
    await expect(service.handoff(original)).rejects.toThrow('handoff_unavailable');
    await expect(service.signIn('demo@example.test', PASSWORD, 'attacker', original)).rejects.toThrow('handoff_unavailable');
    expect(await service.signIn('demo@example.test', PASSWORD, 'attacker')).toBeNull();
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
    expect(await service.signIn('demo@example.test', PASSWORD, 'holder', cookie)).not.toBeNull();
  });
  it('verification links expire and cannot be replayed', async () => {
    const cookie = await service.prepare(fields()); await service.requestVerification(cookie);
    const token = await emailLink(); clock += VERIFY_MS + 1;
    await expect(service.verifyEmail(token)).rejects.toThrow('link_unavailable');
    clock = Date.now(); await service.requestVerification(cookie);
    const newToken = await emailLink(); await service.verifyEmail(newToken);
    await expect(service.verifyEmail(newToken)).rejects.toThrow('link_unavailable');
  });
  it('preserves sponsor/variable data without recruiter assignment, consent, roles or entitlements', async () => {
    const h = await active();
    const [claim] = await port.query('SELECT * FROM member_handoff_claims WHERE account_id=$1', [h.id]);
    expect(claim.sponsor_first).toBe('Test'); expect(claim.sponsor_last).toBe('Sponsor'); expect(claim.variable_data).toEqual({ campaign: 'synthetic-only', role: 'admin' });
    const [candidate] = await port.query('SELECT * FROM candidates');
    expect(candidate.assigned_leader).toBeNull();
    for (const table of ['candidate_consents','program_enrollments','program_roles']) expect(await port.query(`SELECT 1 FROM ${table}`)).toHaveLength(0);
  });
  it.each(['FREE-SYN00001', 'PRO-SYN00001'])('valid %s confirms handoff only, with no course grant', async code => {
    await active({ code });
    expect(await port.query('SELECT 1 FROM program_enrollments')).toHaveLength(0);
  });
  it.each(['FREE-SYN00002','FREE-SYN00003','FREE-SYN00004','FREE-SYN00005','FREE-SYN00099'])('denies expired/reused/revoked/identity-mismatch/unknown code %s atomically', async code => {
    const original = await service.prepare(fields({ code })); await service.signup(original, PASSWORD, PASSWORD);
    const cookie = await service.verifyEmail(await emailLink());
    await expect(service.signIn('demo@example.test', PASSWORD, 'local', cookie)).rejects.toThrow('handoff_not_verified');
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
    expect(await port.query('SELECT 1 FROM candidates')).toHaveLength(0);
  });
  it('refresh/read does not repeat activation; replay cannot overwrite a password', async () => {
    const h = await active();
    expect((await service.handoff(h.cookie)).claimed_by).toBe(h.id);
    await expect(service.signup(h.cookie, 'different-new-password', 'different-new-password')).rejects.toThrow();
    expect(await service.signIn('demo@example.test', PASSWORD, 'local')).not.toBeNull();
  });
  it('existing emails sign in then link without overwriting credentials or duplicating accounts', async () => {
    const first = await active(); const next = await verified({ code: 'FREE-SYN00006' });
    await expect(service.signup(next.cookie, 'not-the-existing-password', 'not-the-existing-password')).resolves.toBeUndefined();
    await service.link(next.cookie, first.member);
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(1);
    expect(await service.signIn('demo@example.test', PASSWORD, 'local')).not.toBeNull();
  });
  it('rejects linking as a different member', async () => {
    const first = await active(); const next = await verified({ me: 'other@example.test', code: 'FREE-SYN00006' });
    await expect(service.link(next.cookie, first.member)).rejects.toThrow('handoff_unavailable');
  });
  it('isolates parallel pending passwords without reserving an email', async () => {
    const a = await service.prepare(fields({ code: 'FREE-SYN00007' })), b = await service.prepare(fields({ code: 'FREE-SYN00008' }));
    const results = await Promise.allSettled([service.signup(a, PASSWORD, PASSWORD), service.signup(b, 'another-password', 'another-password')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(await port.query('SELECT 1 FROM member_pending_signups')).toHaveLength(2);
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
  });
  it('lets the email holder recover a pre-existing pending signup without granting access from email alone', async () => {
    const original = await service.prepare(fields()); await service.signup(original, PASSWORD, PASSWORD);
    const cookie = await service.verifyEmail(await emailLink());
    await service.forgot('demo@example.test', cookie);
    const reset = await emailLink(undefined, 'reset');
    const proof = await service.reset(reset, 'owner-chosen-password', 'owner-chosen-password');
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
    expect(await service.signIn('demo@example.test', PASSWORD, 'requester')).toBeNull();
    expect(await service.signIn('demo@example.test', 'owner-chosen-password', 'holder', proof)).not.toBeNull();
  });
  it('a squatter cannot block a later email holder or choose their password', async () => {
    const a = await service.prepare(fields()), b = await service.prepare(fields({ code: 'FREE-SYN00006' }));
    await service.signup(a, PASSWORD, PASSWORD);
    await service.signup(b, 'owner-chosen-password', 'owner-chosen-password');
    const proof = await service.verifyEmail(await emailLink());
    expect(await service.signIn('demo@example.test', 'owner-chosen-password', 'holder', proof)).not.toBeNull();
    expect(await service.signIn('demo@example.test', PASSWORD, 'squatter', a)).toBeNull();
  });
  it('expires old pending passwords without blocking a new handoff', async () => {
    const a = await service.prepare(fields()); await service.signup(a, PASSWORD, PASSWORD);
    clock += HANDOFF_MS * 2 + 1;
    const b = await service.prepare(fields()); await service.signup(b, PASSWORD, PASSWORD);
    expect(await port.query('SELECT 1 FROM member_pending_signups')).toHaveLength(1);
  });
  it.each(['pending','active','disabled'])('an existing canonical %s account without member credentials returns 409 and stays unchanged',async status=>{
    const candidateId=randomUUID(), accountId=randomUUID();
    await port.query("INSERT INTO candidates(id,name,email,email_verified,capture_channel) VALUES($1,'Synthetic existing','demo@example.test',true,'versa_stub')",[candidateId]);
    await port.query('INSERT INTO user_accounts(id,candidate_id,status) VALUES($1,$2,$3)',[accountId,candidateId,status]);
    const original=await service.prepare(fields()); await service.signup(original,PASSWORD,PASSWORD);
    const cookie=await service.verifyEmail(await emailLink());
    await expect(service.signIn('demo@example.test',PASSWORD,'local',cookie)).rejects.toMatchObject({code:'sign_in_required',status:409});
    expect(await port.query('SELECT status FROM user_accounts WHERE id=$1',[accountId])).toEqual([{status}]);
    expect(await port.query('SELECT 1 FROM member_credentials')).toHaveLength(0);
  });
  it('retains code availability in the upstream verifier: it never redeems or grants', async () => {
    const { verifier, admin } = await syntheticVerifier(SECRET);
    const identity = { userId: 'synthetic-user', email: 'demo@example.test', emailConfirmed: true as const };
    expect(await verifier.check('PRO-SYN00001', identity)).toBe(true);
    expect(await verifier.check('PRO-SYN00001', identity)).toBe(true);
    expect(admin.tables.versa_code_inventory.find(row => row.id === 'PRO-1')?.status).toBe('available');
    expect(admin.tables.versa_entitlements).toHaveLength(0);
  });
});

describe('password lifecycle, sessions and abuse controls', () => {
  it('hashes passwords and challenge tokens, and sends only to a local synthetic sink', async () => {
    const h = await active();
    const [record] = await port.query('SELECT * FROM member_credentials');
    expect(record.password_hash).not.toContain(PASSWORD); expect(passwordMatches(PASSWORD, record.password_salt, record.password_hash)).toBe(true);
    expect(String((await port.query('SELECT * FROM member_challenges'))[0].token_hash)).toMatch(/^[a-f0-9]{64}$/);
    expect(await service.session(h.id, 1)).not.toBeNull();
  });
  it('later email/password login succeeds only for the verified active member', async () => {
    await active(); expect(await service.signIn('demo@example.test', 'wrong', 'local')).toBeNull();
    expect(await service.signIn('unknown@example.test', PASSWORD, 'local')).toBeNull();
    expect(await service.signIn('DEMO@example.test', PASSWORD, 'local')).not.toBeNull();
    await port.query("UPDATE user_accounts SET status='disabled'");
    expect(await service.signIn('demo@example.test', PASSWORD, 'local')).toBeNull();
  });
  it('reset is expiring and single-use, changes no identity, invalidates prior sessions', async () => {
    const h = await active(); await service.forgot('demo@example.test'); const token = await emailLink(undefined, 'reset');
    await service.reset(token, 'changed-password-8', 'changed-password-8');
    await expect(service.reset(token, PASSWORD, PASSWORD)).rejects.toThrow('link_unavailable');
    expect(await service.session(h.id, 1)).toBeNull();
    expect(await service.signIn('demo@example.test', PASSWORD, 'local')).toBeNull();
    expect(await service.signIn('demo@example.test', 'changed-password-8', 'local')).not.toBeNull();
  });
  it('reset expiry and racing token submissions are handled atomically', async () => {
    await active(); await service.forgot('demo@example.test'); let token = await emailLink(undefined, 'reset');
    clock += RESET_MS + 1; await expect(service.reset(token, PASSWORD, PASSWORD)).rejects.toThrow('link_unavailable');
    clock = Date.now(); await service.forgot('demo@example.test'); token = await emailLink(undefined, 'reset');
    const results = await Promise.allSettled([service.reset(token, PASSWORD, PASSWORD), service.reset(token, PASSWORD, PASSWORD)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('authenticated change requires current password and invalidates old reset/session state', async () => {
    const h = await active(); await service.forgot('demo@example.test'); const reset = await emailLink(undefined, 'reset');
    await expect(service.change(h.member, 'wrong', PASSWORD, PASSWORD)).rejects.toThrow('password_invalid');
    await service.change(h.member, PASSWORD, 'changed-password-8', 'changed-password-8');
    expect(await service.session(h.id, 1)).toBeNull();
    await expect(service.reset(reset, PASSWORD, PASSWORD)).rejects.toThrow('link_unavailable');
  });
  it('logout invalidates sessions and the read-only handoff', async () => {
    const h = await active(); await service.logout(h.member, h.cookie);
    expect(await service.session(h.id, 1)).toBeNull(); await expect(service.handoff(h.cookie)).rejects.toThrow('handoff_unavailable');
  });
  it('expires handoff state and rate-limits repeated mail requests', async () => {
    const cookie = await service.prepare(fields()); clock += HANDOFF_MS + 1;
    await expect(service.handoff(cookie)).rejects.toThrow('handoff_unavailable');
    for (let index=0; index<5; index++) await service.limit('mail-subject', 5);
    await expect(service.limit('mail-subject', 5)).rejects.toBeInstanceOf(MemberError);
    expect(String((await port.query('SELECT key_hash FROM member_rate_limits'))[0].key_hash)).not.toContain('mail-subject');
  });
});


describe('signed opaque transport, format adapter and least privilege', () => {
  function signed(body = JSON.stringify({ mfn:'Demo',mln:'Member',me:'demo@example.test',sfn:'Test',sln:'Sponsor',code:'FREE-SYN00001' })) {
    const timestamp=String(Math.floor(clock/1000)), nonce=randomBytes(32).toString('hex');
    return { body, headers: new Headers({ 'x-versa-timestamp':timestamp,'x-versa-nonce':nonce,'x-versa-signature':issuerSignature(SECRET,timestamp,nonce,body) }) };
  }
  it('authenticates all six fields plus extras before issuing an opaque single-use ticket', async () => {
    const input=signed(); const { payload,nonce }=authenticatedPayload(SECRET,input.headers,input.body,clock);
    const ticket=await issueTicket(service,payload,nonce);
    expect(ticket).not.toContain('demo'); expect(ticket).not.toContain('FREE');
    const cookie=await consumeTicket(service,ticket); expect((await service.handoff(cookie)).payload.me).toBe(payload.me);
    await expect(consumeTicket(service,ticket)).rejects.toThrow('handoff_unavailable');
    expect(await port.query('SELECT 1 FROM user_accounts')).toHaveLength(0);
  });
  it('rejects signature, sponsor, timestamp, duplicate JSON and ticket tampering', async () => {
    const input=signed();
    expect(()=>authenticatedPayload(SECRET,input.headers,input.body.replace('Sponsor','Tampered'),clock)).toThrow();
    expect(()=>authenticatedPayload(SECRET,input.headers,input.body,clock+120001)).toThrow();
    expect(()=>authenticatedPayload('short',input.headers,input.body,clock)).toThrow();
    const duplicate=signed('{"me":"one@example.test","me":"two@example.test"}');
    expect(()=>authenticatedPayload(SECRET,duplicate.headers,duplicate.body,clock)).toThrow();
    const ticket=await issueTicket(service,fields(),randomBytes(32).toString('hex'));
    await expect(consumeTicket(service,'0'+ticket.slice(1,-1)+'x')).rejects.toThrow();
    clock+=TICKET_MS+1; await expect(consumeTicket(service,ticket)).rejects.toThrow();
  });
  it('rejects issuer nonce replay and serializes parallel ticket consumption', async () => {
    const nonce=randomBytes(32).toString('hex'), ticket=await issueTicket(service,fields(),nonce);
    await expect(issueTicket(service,fields(),nonce)).rejects.toThrow();
    const results=await Promise.allSettled([consumeTicket(service,ticket),consumeTicket(service,ticket)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it('accepts a reviewed alternate format only through the injected config adapter', () => {
    const input=signed(JSON.stringify({mfn:'Demo',mln:'Member',me:'demo@example.test',sfn:'Test',sln:'Sponsor',code:'SYNTHETIC:01'}));
    expect(()=>authenticatedPayload(SECRET,input.headers,input.body,clock)).toThrow();
    const custom={normalize:(v:string)=>/^SYNTHETIC:\d{2}$/.test(v)?v:null};
    expect(authenticatedPayload(SECRET,input.headers,input.body,clock,custom).payload.code).toBe('SYNTHETIC:01');
  });
  it('runs activation as member_app and denies mail reading, staff data and entitlement writes', async () => {
    let cookie:string;
    try {
      await port.query('SET ROLE member_app');
      cookie=await service.prepare(fields()); await service.signup(cookie,PASSWORD,PASSWORD);
      await expect(port.query('SELECT link FROM member_local_mail')).rejects.toThrow(/permission denied/);
      await expect(port.query('SELECT name FROM candidates')).rejects.toThrow(/permission denied/);
      await expect(port.query('INSERT INTO program_roles DEFAULT VALUES')).rejects.toThrow(/permission denied/);
    } finally { await port.query('RESET ROLE'); }
    const token=await emailLink();
    try {
      await port.query('SET ROLE member_app');
      const proof=await service.verifyEmail(token);
      expect(await service.signIn('demo@example.test',PASSWORD,'local',proof)).not.toBeNull();
    } finally { await port.query('RESET ROLE'); }
    for (const role of ['gia_app','anon','authenticated']) {
      try { await port.query(`SET ROLE ${role}`); await expect(port.query('SELECT payload FROM member_arrival_tickets')).rejects.toThrow(/permission denied/); }
      finally { await port.query('RESET ROLE'); }
    }
    const rows=await port.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'member_%' AND relkind='r'");
    expect(rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  });
});

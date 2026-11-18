import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MemberError } from './service';
const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; email: string; authVersion?: number } }, disabled: false }));
const fake = vi.hoisted(() => ({ prepare: vi.fn(), origin: 'http://127.0.0.1:3002', limit: vi.fn(), requestVerification: vi.fn(), verifyEmail: vi.fn(), signup: vi.fn(), forgot: vi.fn(), reset: vi.fn(), link: vi.fn(), change: vi.fn(), logout: vi.fn(), expire: vi.fn(), session: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('./runtime', async () => ({ memberAdapters: { codeFormat: (await import('./code-format')).syntheticCodeFormat }, memberService: () => { if (state.disabled) throw new MemberError('member_unavailable', 503); return fake; } }));
import { POST } from '@/app/api/member/route';
import { GET as arrival } from '@/app/api/member/arrival/route';
import { setHandoff } from './http';
import { NextResponse } from 'next/server';
const ORIGIN = 'http://127.0.0.1:3002';
function request(body: unknown, origin: string | null = ORIGIN) {
  return new NextRequest(`${ORIGIN}/api/member`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}), cookie: `spike_member_handoff=${'a'.repeat(64)}` }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); state.session = null; state.disabled = false; fake.origin = ORIGIN; fake.verifyEmail.mockResolvedValue('b'.repeat(64)); fake.prepare.mockResolvedValue('c'.repeat(64)); });
it.each([null, 'https://unrelated.example.test'])('rejects missing or cross-site Origin %s', async origin => {
  expect((await POST(request({ action: 'begin' }, origin))).status).toBe(403);
  expect(fake.requestVerification).not.toHaveBeenCalled();
});
it.each(['me','mfn','accountId','code','emailVerified','role','extra'])('rejects tampered identity/authority key %s before activation', async key => {
  const response = await POST(request({ action: 'signup', password: 'Synthetic-only-password', confirm: 'Synthetic-only-password', [key]: 'tampered' }));
  expect(response.status).toBe(400); expect(fake.signup).not.toHaveBeenCalled();
});
it('bounds request bodies and rejects unsupported actions', async () => {
  expect((await POST(request({ action: 'reset', token: 'x'.repeat(5000) }))).status).toBe(400);
  expect((await POST(request({ action: 'redeem', code: 'FREE-SYN00001' }))).status).toBe(400);
});
it('uses only the HttpOnly-bound handoff on activation', async () => {
  const response = await POST(request({ action: 'signup', password: 'Synthetic-only-password', confirm: 'Synthetic-only-password' }));
  expect(response.status).toBe(200);
  expect(fake.signup).toHaveBeenCalledWith('a'.repeat(64), 'Synthetic-only-password', 'Synthetic-only-password');
});
it('requires a member session and never upgrades a staff namespace', async () => {
  expect((await POST(request({ action: 'claim' }))).status).toBe(401);
  state.session = { user: { id: 'staff:admin@example.test', email: 'admin@example.test' } };
  expect((await POST(request({ action: 'claim' }))).status).toBe(401);
  expect(fake.link).not.toHaveBeenCalled();
});
it('keeps generic reset responses identical for unknown accounts and mail-adapter failures', async () => {
  fake.forgot.mockImplementation(async (email: string) => { if (email === 'known@example.test') throw new Error('private-provider-error'); });
  const known = await POST(request({ action: 'forgot', email: 'known@example.test' }));
  const unknown = await POST(request({ action: 'forgot', email: 'unknown@example.test' }));
  expect(known.status).toBe(200); expect(unknown.status).toBe(200);
  expect(await known.json()).toEqual(await unknown.json());
});
it('fails closed without deployment dependencies and emits no raw errors', async () => {
  state.disabled = true;
  const response = await POST(request({ action: 'begin' }));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'member_unavailable' });
});
it('uses secure, HttpOnly, same-site handoff cookies on HTTPS', () => {
  const response = setHandoff(NextResponse.json({ ok: true }), 'b'.repeat(64), 'https://staging.example.test');
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('Secure'); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=lax');
  expect(response.cookies.get('spike_member_handoff')!.value).toBe('b'.repeat(64));
});
it('always sends no-store and no-referrer on member responses', async () => {
  const response = await POST(request({ action: 'begin' }));
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
});

afterEach(() => vi.unstubAllEnvs());
it('rejects unsigned plain queries by default even in local demo mode', async () => {
  vi.stubEnv('MEMBER_ALLOW_PLAIN_QUERY',''); vi.stubEnv('MEMBER_LOCAL_DEMO','true');
  const response=await arrival(new NextRequest(ORIGIN+'/?mfn=Demo&mln=Member&me=demo%40example.test&sfn=Test&sln=Sponsor&code=FREE-SYN00001'));
  expect(response.headers.get('location')).toBe('/signup'); expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(fake.prepare).not.toHaveBeenCalled();
});
it('requires both explicit local flags for the synthetic plain-query fallback', async () => {
  vi.stubEnv('MEMBER_ALLOW_PLAIN_QUERY','true'); vi.stubEnv('MEMBER_LOCAL_DEMO','false');
  const request=new NextRequest(ORIGIN+'/?mfn=Demo&mln=Member&me=demo%40example.test&sfn=Test&sln=Sponsor&code=FREE-SYN00001');
  await arrival(request); expect(fake.prepare).not.toHaveBeenCalled();
  vi.stubEnv('MEMBER_LOCAL_DEMO','true');
  const response=await arrival(request);
  expect(fake.prepare).toHaveBeenCalledOnce(); expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/signup'); expect(response.cookies.get('spike_member_handoff')?.value).toBe('c'.repeat(64));
});

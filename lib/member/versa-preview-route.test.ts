import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('../../app/api/member/arrival/route', () => ({ GET: vi.fn(async () => new NextResponse(null, { status: 303, headers: { Location: '/signup' } })) }));
import { GET } from '../../app/route';
import { GET as memberArrival } from '../../app/api/member/arrival/route';
import { VERSA_PREVIEW_COOKIE } from './versa-preview';
afterEach(() => vi.clearAllMocks());
const query = new URLSearchParams({ mfn: 'Test', mln: 'Member', me: 'test.member@example.test', sfn: 'Test', sln: 'Sponsor', code: 'FREE-SYN00001' });
it('accepts staging synthetic GET without invoking account service and cleans the URL', async () => {
  const response = await GET(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/?' + query));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/spike-preview');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.cookies.get(VERSA_PREVIEW_COOKIE)?.value).toBe(query.toString());
  expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/);
  expect(memberArrival).not.toHaveBeenCalled();
});
it('preserves signed handoff routing and clears stale preview context', async () => {
  const response = await GET(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/?handoff=test-ticket'));
  expect(memberArrival).toHaveBeenCalledOnce();
  expect(response.headers.get('location')).toBe('/signup');
  expect(response.cookies.get(VERSA_PREVIEW_COOKIE)?.value).toBe('');
});
it('does not enable synthetic compatibility on another hostname', async () => {
  await GET(new NextRequest('https://spike-asc.pages.dev/?' + query));
  expect(memberArrival).toHaveBeenCalledOnce();
});

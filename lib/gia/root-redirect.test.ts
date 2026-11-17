import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import nextConfig from '@/next.config';
import { GET } from '@/app/route';

it('lets the root receiver consume handoffs before a static redirect', async () => {
  const rules = await nextConfig.redirects!();
  expect(rules.some(rule => rule.source === '/')).toBe(false);
});
it('redirects ordinary root visits temporarily, preserving non-handoff query fields', async () => {
  const response = await GET(new NextRequest('http://localhost/?campaign=synthetic'));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/spike-preview?campaign=synthetic');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('does not forward malformed partner fields into a second URL', async () => {
  const response = await GET(new NextRequest('http://localhost/?mfn=Demo&code=FREE-SYN00001&extra=variable'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/signup');
  expect(JSON.stringify([...response.headers])).not.toContain('FREE-SYN00001');
  expect(JSON.stringify([...response.headers])).not.toContain('variable');
});

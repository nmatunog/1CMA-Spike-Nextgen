import { expect, it } from 'vitest';
import nextConfig from '@/next.config';
import HomePage from '@/app/page';

it('sends / to /gia with a temporary (307) redirect in next.config', async () => {
  const rules = await nextConfig.redirects!();
  expect(rules).toContainEqual({ source: '/', destination: '/gia', permanent: false });
  expect(rules.some((rule) => rule.source === '/' && rule.permanent === true)).toBe(false);
});

it('HomePage server-renders a temporary redirect to /gia', () => {
  try {
    HomePage();
    throw new Error('expected redirect("/gia")');
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? error);
    expect(digest).toMatch(/NEXT_REDIRECT/);
    expect(digest).toMatch(/\/gia/);
    expect(digest).toMatch(/307/);
    expect(digest).not.toMatch(/308/);
  }
});

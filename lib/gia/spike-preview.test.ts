import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import nextConfig from '@/next.config';
import HomePage from '@/app/page';
import {
  FEP_INVITE,
  GIA_CONSENT_SAVE,
  GIA_DISCLAIMER,
  GIA_QUICK_REPLIES_RECRUIT,
  GIA_TITLE,
  LITERACY_INVITE,
  SPIKE_PREVIEW_PATH,
  STAFF_POST_LOGIN_PATH,
} from '@/lib/gia/ui-copy';

const landing = readFileSync('components/spike-preview/SpikePreviewLanding.tsx', 'utf8');
const chat = readFileSync('components/gia/GiaChat.tsx', 'utf8');
const login = readFileSync('app/login/page.tsx', 'utf8');
const home = readFileSync('app/page.tsx', 'utf8');
const giaPage = readFileSync('app/gia/page.tsx', 'utf8');

it('keeps / as a temporary redirect to /gia', async () => {
  const rules = await nextConfig.redirects!();
  expect(rules).toContainEqual({ source: '/', destination: '/gia', permanent: false });
  expect(home).toMatch(/redirect\(["']\/gia["']\)/);
  try {
    HomePage();
    throw new Error('expected redirect');
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? error);
    expect(digest).toMatch(/NEXT_REDIRECT/);
    expect(digest).toMatch(/\/gia/);
    expect(digest).toMatch(/307/);
  }
});

it('serves SPIKE × Versa visitor preview at /spike-preview without fake capture', () => {
  expect(SPIKE_PREVIEW_PATH).toBe('/spike-preview');
  expect(readFileSync('app/spike-preview/page.tsx', 'utf8')).toContain('SpikePreviewLanding');
  expect(landing).toMatch(/Free Financial Literacy/);
  expect(landing).toMatch(/Free Financial Entrepreneurship Preview/);
  expect(landing).toMatch(/Level-Up Financial Entrepreneurship/);
  expect(landing).toMatch(/Coming soon · not live/);
  expect(landing).toMatch(/Direct entry allowed/);
  expect(landing).toContain('Ask GIA');
  expect(landing).toContain('<GiaChat');
  expect(landing).not.toMatch(/VC-style safety net/);
  expect(landing).not.toMatch(/date-of-birth|dateOfBirth|type="date"/);
  expect(landing).not.toMatch(/Residence address|type="file"/);
  expect(landing).not.toMatch(/Submit demo enrollment|Sign up & explore/);
  expect(landing).toMatch(/Synthetic details only/);
  expect(landing).toMatch(/Versa/);
  expect(landing).toMatch(/1CMA/);
});

it('embeds the same GIA chat on /gia and the landing panel', () => {
  expect(giaPage).toContain('GiaChat');
  expect(landing).toContain('GiaChat');
  expect(chat).toContain("fetch('/api/gia'");
  expect(chat).toContain('{GIA_TITLE}');
  expect(chat).toContain('{GIA_DISCLAIMER}');
  expect(chat).toContain('{GIA_CONSENT_FINE}');
  expect(chat).toContain('{GIA_CONSENT_CHECKBOX}');
  expect(chat).toContain('{GIA_CONSENT_SAVE}');
  expect(GIA_TITLE).toBe('GIA — Your 1CMA AI Guide');
  expect(GIA_DISCLAIMER).toBe('Learning does not authorize you to sell insurance or give insurance advice.');
  expect(GIA_CONSENT_SAVE).toBe('Save consent and contact');
  expect(GIA_QUICK_REPLIES_RECRUIT).toEqual([
    LITERACY_INVITE,
    FEP_INVITE,
    'What should I do next?',
    'Talk to a 1CMA Leader',
  ]);
  expect(chat).not.toMatch(/Grok|xAI|attach|model picker|regenerate/i);
  expect(chat).toMatch(/STOP \/ opt out/);
  expect(chat).toMatch(/Privacy notice/);
});

it('sends staff from /login to Command Center', () => {
  expect(STAFF_POST_LOGIN_PATH).toBe('/recruitment/command');
  expect(login).toContain('STAFF_POST_LOGIN_PATH');
  expect(login).not.toMatch(/router\.push\(["']\/["']\)/);
});

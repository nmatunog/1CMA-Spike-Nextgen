import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import nextConfig from '@/next.config';
import { GET as rootGet } from '@/app/route';
import { NextRequest } from 'next/server';
import {
  FEP_INVITE,
  GIA_CONSENT_SAVE,
  GIA_DISCLAIMER,
  GIA_JTBD,
  GIA_QUICK_REPLIES_RECRUIT,
  GIA_TITLE,
  INTERN_INVITE,
  LEADER_INVITE,
  LITERACY_INVITE,
  SPIKE_PREVIEW_PATH,
  STAFF_POST_LOGIN_PATH,
  resolveGiaPrompt,
  visibleJtbd,
} from '@/lib/gia/ui-copy';

const landing = readFileSync('components/spike-preview/SpikePreviewLanding.tsx', 'utf8');
const chat = readFileSync('components/gia/GiaChat.tsx', 'utf8');
const login = readFileSync('app/login/page.tsx', 'utf8');
const home = readFileSync('app/route.ts', 'utf8');
const giaPage = readFileSync('app/gia/page.tsx', 'utf8');

it('keeps / as a temporary redirect to /spike-preview', async () => {
  const rules = await nextConfig.redirects!();
  expect(rules.some(rule => rule.source === '/')).toBe(false); // Middleware prepares handoffs first.
  expect(home).toContain('receiveHandoff');
  const response = await rootGet(new NextRequest('http://localhost/'));
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!, 'http://localhost').pathname).toBe('/spike-preview');
});

it('serves only the approved chat-first landing and preserves the full chat route', () => {
  expect(SPIKE_PREVIEW_PATH).toBe('/spike-preview');
  expect(readFileSync('app/spike-preview/page.tsx', 'utf8')).toContain('SpikePreviewLanding');
  expect(readFileSync('app/gia/page.tsx', 'utf8')).toContain("dynamic = 'force-dynamic'");
  expect(giaPage).toContain('GIA, your 1CMA guide to SPIKE.');
  for (const copy of ['Ask GIA. Start free.', 'Your 1CMA guide to growing into a financial entrepreneur.', 'What is SPIKE?', 'Hear it from GIA', 'Free Financial Literacy', 'Start learning, free', 'Talk to GIA', 'Ask anything, anytime', 'Reply STOP to opt out']) expect(landing).toContain(copy);
  expect(landing).toContain("useState<'light' | 'dark'>('light')");
  expect(landing).toContain("openGia('What is SPIKE?')");
  expect(landing).toContain("openGia('is financial literacy free')");
  expect(landing).toContain('<GiaChat');
  expect(landing).toContain('<GiaAvatar');
  expect(landing).toContain('/gia/privacy');
  expect(landing).not.toMatch(/Find your path|routePathPicker|RegisterWithRecruiter|AboutAiaCareer|JOURNEY_STEP3_NOTE|giaFab|review-banner|Meet GIA|video-placeholder|<nav/);
  expect(landing).not.toMatch(/irecruit|join-us-now|type="file"|type="date"|localStorage|sessionStorage|indexedDB/);
});

it('maps visitor-goal chips to approved GIA flows without new content claims', () => {
  expect(GIA_JTBD.map((item) => item.text)).toEqual([
    LITERACY_INVITE,
    FEP_INVITE,
    INTERN_INVITE,
    LEADER_INVITE,
  ]);
  expect(resolveGiaPrompt('I want to learn money basics')).toEqual({ text: LITERACY_INVITE, program: 'recruit' });
  expect(resolveGiaPrompt('I want to explore a business path')).toEqual({ text: FEP_INVITE, program: 'recruit' });
  expect(resolveGiaPrompt("I'm a student / intern")).toEqual({ text: INTERN_INVITE, program: 'intern' });
  expect(resolveGiaPrompt('Talk to a 1CMA leader')).toEqual({ text: LEADER_INVITE });
  expect(visibleJtbd('intern').map((item) => item.label)).not.toContain('I want to learn money basics');
  expect(GIA_QUICK_REPLIES_RECRUIT).toEqual([
    LITERACY_INVITE,
    FEP_INVITE,
    'What should I do next?',
    LEADER_INVITE,
  ]);
  expect(chat).toContain('resolveVisitorPrompt');
  expect(chat).toContain('visibleJtbd');
  expect(chat).toContain('AIA_CAREER_CHIPS');
  expect(chat).toContain('RegisterWithRecruiter');
  expect(chat).toContain('GiaCitation');
  expect(chat).not.toMatch(/href=\{t\.citation\.source\}/);
  expect(chat).toContain('GIA is typing');
  expect(chat).toContain('Skip wait');
});

it('uses the supplied local Inter on the landing and keeps the offline chat font fixture', () => {
  const fontMock = readFileSync('tests/gia/font-mock.cjs', 'utf8');
  expect(giaPage).toMatch(/from 'next\/font\/google'/);
  expect(readFileSync('app/spike-preview/page.tsx', 'utf8')).toMatch(/from 'next\/font\/local'/);
  expect(fontMock).toContain('family=Inter:wght@100..900');
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
  expect(GIA_TITLE).toBe('GIA');
  expect(GIA_DISCLAIMER).toBe('Learning does not authorize you to sell insurance or give insurance advice.');
  expect(GIA_CONSENT_SAVE).toBe('Save consent and contact');
  expect(chat).not.toMatch(/Grok|xAI|attach|model picker|regenerate/i);
  expect(chat).toMatch(/STOP \/ opt out/);
  expect(chat).toMatch(/Privacy notice/);
});

it('sends staff from /login to Command Center', () => {
  expect(STAFF_POST_LOGIN_PATH).toBe('/recruitment/command');
  expect(login).toContain('STAFF_POST_LOGIN_PATH');
  expect(login).not.toMatch(/router\.push\(["']\/["']\)/);
});

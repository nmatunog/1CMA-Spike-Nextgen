import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import nextConfig from '@/next.config';
import HomePage from '@/app/page';
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
  expect(readFileSync('app/spike-preview/page.tsx', 'utf8')).toContain("dynamic = 'force-dynamic'");
  expect(readFileSync('app/gia/page.tsx', 'utf8')).toContain("dynamic = 'force-dynamic'");
  expect(landing).toMatch(/Free Financial Literacy/);
  expect(landing).toMatch(/Free Financial Entrepreneurship Preview/);
  expect(landing).toMatch(/Level-Up Financial Entrepreneurship/);
  expect(landing).toMatch(/Coming soon · not live/);
  expect(landing).toMatch(/Direct entry allowed/);
  expect(landing).toContain('Ask GIA');
  expect(landing).toContain('<GiaChat');
  expect(landing).toContain('askGia');
  expect(landing).toContain('Find your path');
  expect(landing).toContain('routePathPicker');
  expect(landing).toContain('Register with your recruiter');
  expect(landing).toContain('SPIKE Venture Studio');
  expect(landing).toContain('JOURNEY_STEP3_NOTE');
  expect(landing).toContain('Nothing is stored. No account.');
  expect(landing).toContain('AboutAiaCareer');
  expect(landing).toContain('RegisterWithRecruiter');
  expect(landing).not.toMatch(/href=["'][^"']*irecruit/i);
  expect(landing).not.toMatch(/href=["']https:\/\/www\.aia\.com\.ph\/en\/financialadvisor\/join-us-now["']/);
  expect(landing).not.toMatch(/never opens a generic AIA sign-up|awaiting Nilo|Not downloaded|no embed, no hotlink/);
  expect(landing).toContain('{GIA_DISCLAIMER}');
  expect(landing).toContain('/gia/privacy');
  expect(landing).toMatch(/STOP/);
  expect(landing).toMatch(/loading="lazy"/);
  expect(landing).not.toMatch(/VC-style safety net/);
  expect(landing).not.toMatch(/date-of-birth|dateOfBirth|type="date"/);
  expect(landing).not.toMatch(/Residence address|type="file"/);
  expect(landing).not.toMatch(/Submit demo enrollment|Sign up & explore/);
  expect(landing).not.toMatch(/Premium|priceless|₱0/i);
  expect(landing).toMatch(/Synthetic details only/);
  expect(landing).toMatch(/Versa/);
  expect(landing).toMatch(/1CMA/);
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
  expect(chat).toContain('resolveGiaPrompt');
  expect(chat).toContain('visibleJtbd');
  expect(chat).toContain('AIA_CAREER_CHIPS');
  expect(chat).toContain('RegisterWithRecruiter');
  expect(chat).toContain('GiaCitation');
  expect(chat).not.toMatch(/href=\{t\.citation\.source\}/);
  expect(chat).toContain('GIA is typing');
  expect(chat).toContain('Skip wait');
});

it('mocks Inter for the offline Next.js build gate', () => {
  const fontMock = readFileSync('tests/gia/font-mock.cjs', 'utf8');
  expect(giaPage).toMatch(/from 'next\/font\/google'/);
  expect(readFileSync('app/spike-preview/page.tsx', 'utf8')).toMatch(/from 'next\/font\/google'/);
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
  expect(GIA_TITLE).toBe('GIA — Your 1CMA AI Guide');
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

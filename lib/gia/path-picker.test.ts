import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIA_CAREER_CHIPS,
  AIA_FAQ_ASK,
  AIA_JOIN_ASK,
  AIA_LEVELUP_ASK,
  PATH_GOALS,
  PATH_SITUATIONS,
  PATH_TIMES,
  routePathPicker,
} from './path-picker';
import { FEP_INVITE, INTERN_INVITE, LITERACY_INVITE } from './ui-copy';
import { typingDelayMs } from './typing';

describe('Find your path picker', () => {
  it('routes three taps with no account and never stores answers', () => {
    expect(PATH_GOALS).toHaveLength(3);
    expect(PATH_SITUATIONS).toHaveLength(3);
    expect(PATH_TIMES).toHaveLength(3);
    expect(routePathPicker({ goal: 'literacy', situation: 'working', time: 'intro' })).toEqual({
      invitation: 'literacy',
      prompt: LITERACY_INVITE,
      program: 'recruit',
      highlight: 'literacy',
    });
    expect(routePathPicker({ goal: 'business', situation: 'family', time: 'intro' })).toEqual({
      invitation: 'fep',
      prompt: FEP_INVITE,
      program: 'recruit',
      highlight: 'fep',
    });
    expect(routePathPicker({ goal: 'advisor', situation: 'working', time: 'intro' })).toEqual({
      invitation: 'advisor',
      prompt: AIA_JOIN_ASK,
      program: 'recruit',
      highlight: 'advisor',
    });
    expect(routePathPicker({ goal: 'business', situation: 'working', time: 'recruiter' }).invitation).toBe('advisor');
    expect(routePathPicker({ goal: 'literacy', situation: 'student', time: 'recruiter' })).toEqual({
      invitation: 'intern',
      prompt: INTERN_INVITE,
      program: 'intern',
      highlight: null,
    });
    const src = readFileSync('components/spike-preview/SpikePreviewLanding.tsx', 'utf8');
    expect(src).toContain('routePathPicker');
    expect(src).toContain('Find your path');
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('keeps AIA career chips without generic Join us URLs', () => {
    expect(AIA_JOIN_ASK).toBe('How do I join AIA / register?');
    expect(AIA_LEVELUP_ASK).toBe('Is AIA registration the same as paying for Level-Up?');
    expect(AIA_FAQ_ASK).toBe('AIA advisor career FAQs');
    expect(AIA_CAREER_CHIPS).toContain(AIA_JOIN_ASK);
    expect(JSON.stringify(AIA_CAREER_CHIPS)).not.toMatch(/join-us-now|partner-with-the-best|irecruit/i);
  });
});

describe('GIA reduced-motion typing', () => {
  it('skips the typing wait when prefers-reduced-motion is set', () => {
    expect(typingDelayMs(false)).toBe(400);
    expect(typingDelayMs(true)).toBe(0);
    const css = readFileSync('components/gia/gia-chat.module.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/animation:\s*none !important/);
    const chat = readFileSync('components/gia/GiaChat.tsx', 'utf8');
    expect(chat).toContain('typingDelayMs');
    expect(chat).toContain('prefersReducedMotion');
    expect(chat).toContain('Skip wait');
    expect(chat).toContain('GIA is typing');
  });
});

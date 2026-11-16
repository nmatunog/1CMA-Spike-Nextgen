import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import selected from '../../docs/gia/owner-wording-2026-11-16.json';
import { entries } from './knowledge/domains/recruitment.mjs';
import { respond, knowledge } from './engine.mjs';
import { resolveVisitorPrompt } from './first-screen';
import { visitorSafeHref } from './visitor-hrefs';

const exactEnglish = "SPIKE is a guided pathway from 1CMA Cebu that helps you grow into a financial entrepreneur, step by step, through workshops, mentorship and real-world practice. I'm GIA, and I'll walk you through it.";
const now = new Date('2026-11-16T12:00:00Z');
const snapshot = selected.entries.map(({ id, version, answers }) => ({ id, version, answers }));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const intro = entries.find(e => e.id === 'KP-REC-09')!;

describe('U1 owner-approved SPIKE introduction', () => {
  it('changes the fingerprint only by appending one approved English answer', () => {
    expect(snapshot).toHaveLength(9);
    expect(digest(snapshot.slice(0, 8))).toBe('2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad');
    expect(digest(snapshot)).toBe('57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438');
    expect(selected.answersSha256).toBe(digest(snapshot));
    expect(snapshot[8]).toEqual({ id: 'KP-REC-09', version: '0.1', answers: { en: exactEnglish } });
    expect(readFileSync('docs/gia/owner-wording-2026-11-16.md', 'utf8')).toContain(exactEnglish);
  });
  it('keeps translations pending and entirely outside approved runtime answers', () => {
    const drafts = readFileSync('docs/gia/spike-intro-translations-pending-2026-11-16.md', 'utf8');
    expect(drafts).toContain('Cebuano — PENDING NILO APPROVAL');
    expect(drafts).toContain('Tagalog — PENDING NILO APPROVAL');
    expect(Object.keys(intro.answers)).toEqual(['en']);
    expect(intro.answers.en).toBe(exactEnglish);
    expect(visitorSafeHref(intro.source)).toBeNull();
  });
  it.each(['en', 'ceb', 'tl'])('distinguishes the chips while retaining English intro fallback in %s', language => {
    const what = respond(resolveVisitorPrompt('What is this?').text, language, knowledge, now);
    const free = respond(resolveVisitorPrompt('Is it free?').text, language, knowledge, now);
    expect(what).toMatchObject({ intent: 'answer', language, text: exactEnglish, citation: { id: 'KP-REC-09', version: '0.1' } });
    expect(what.text).not.toMatch(/GIYA/i);
    expect(free.citation?.id).toBe('KP-LIT-01');
    expect(what.text).not.toBe(free.text);
  });
  it.each(['intern', 'ra'])('retains the %s adapter restrictions', program => {
    const reply = respond('What is SPIKE?', 'en', knowledge, now, { program });
    expect(reply.intent).toBe('request_leader');
    expect(reply.citation?.id).not.toBe('KP-REC-09');
  });
  it('does not change safety precedence or historical approval windows', () => {
    expect(respond('What is SPIKE? My AIA password is sunshine', 'en', knowledge, now)).toMatchObject({ intent: 'refuse', reason: 'aia_credentials' });
    expect(respond('What is SPIKE? I want to die', 'en', knowledge, now)).toMatchObject({ reason: 'urgent', citation: { id: 'KP-SAFETY-01' } });
    expect(respond('STOP', 'en', knowledge, now).intent).toBe('opt_out');
    expect(respond('What is SPIKE?', 'en', knowledge, new Date('2026-11-15T12:00:00Z')).intent).toBe('request_leader');
  });
});

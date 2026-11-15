import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import selected from '../../docs/gia/owner-wording-2026-11-16.json';
import { entries } from './knowledge/domains/recruitment.mjs';
import { isApproved, validateEntry } from './knowledge-import.mjs';
import { respond, knowledge } from './engine.mjs';

const now = new Date('2026-11-16T12:00:00Z');
const questions: Record<string, string> = {
  'KP-REC-01': 'How do I join AIA?',
  'KP-REC-02': 'Is AIA registration the same as paying for Level-Up?',
  'KP-REC-03': 'What does an AIA advisor do?',
  'KP-REC-04': 'What training and support do I get?',
  'KP-REC-05': 'Who can apply to be an AIA advisor?',
  'KP-REC-06': 'What does the AIA advisor path look like?',
  'KP-REC-07': 'AIA advisor career FAQs',
  'KP-REC-08': 'Does SPIKE submit or confirm my AIA application?',
};
describe('owner-selected recruitment wording', () => {
  it('preserves the exact reviewed snapshot and all 24 language answers', () => {
    const snapshot = selected.entries.map(({ id, version, answers }) => ({ id, version, answers }));
    expect(snapshot).toHaveLength(8);
    expect(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')).toBe(selected.answersSha256);
    const current = entries.filter(e => isApproved(e, now));
    expect(current.map(({ id, version, answers }) => ({ id, version, answers }))).toEqual(snapshot);
    expect(new Set(current.map(e => e.id)).size).toBe(8);
    for (const e of current) {
      expect(validateEntry(e), e.id).toEqual([]);
      expect(isApproved(e, now), e.id).toBe(true);
      expect(isApproved(e, new Date('2026-11-14T12:00:00Z')), e.id).toBe(false);
      expect(e.approvalRef).toContain('/blob/a3560c8838d2c5d574427f0bf59a0bd2407fdd68/');
    }
  });
  for (const e of selected.entries) for (const lang of ['en', 'ceb', 'tl'] as const) {
    it(`serves ${e.id} ${lang} exactly as reviewed`, () => {
      const reply = respond(questions[e.id], lang, knowledge, now, { program: 'recruit' });
      expect(reply.intent).toBe('answer');
      expect(reply.citation).toMatchObject({ id: e.id, version: e.version });
      expect(reply.text).toBe(e.answers[lang]);
    });
  }
  it.each([
    'Ang SPIKE ba ang mo-submit o mo-confirm sa akong AIA application?',
    'Ang SPIKE ba ang magsu-submit o magko-confirm ng AIA application ko?',
    'Who submits my AIA application?',
  ])('recognizes the separate application-process FAQ: %s', question => {
    expect(respond(question, 'en', knowledge, now).citation?.id).toBe('KP-REC-08');
  });
  it.each(['intern', 'ra'])('keeps the application FAQ out of the %s guide', program => {
    const reply = respond(questions['KP-REC-08'], 'en', knowledge, now, { program });
    expect(reply.intent).toBe('request_leader');
    expect(reply.citation?.id).not.toBe('KP-REC-08');
  });
  it('does not let the application FAQ bypass credential refusal', () => {
    const reply = respond('Does SPIKE submit my AIA application? My AIA password is sunshine', 'en', knowledge, now);
    expect(reply).toMatchObject({ intent: 'refuse', reason: 'aia_credentials' });
  });
});

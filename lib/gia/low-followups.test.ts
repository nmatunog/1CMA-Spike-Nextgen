import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { respond, knowledge, isAiaSubmissionQuery } from './engine.mjs';
import { entries } from './knowledge/domains/recruitment.mjs';
import selected from '../../docs/gia/owner-wording-2026-11-16.json';
import config from '../../vitest.config';

const now = new Date('2026-11-16T12:00:00Z');
describe('LOW-N3 approved password-sharing safety handoff', () => {
  it.each([
    ['en', 'Should I share my AIA password with my recruiter?', 'Do not send your AIA login credentials.'],
    ['en', 'Is it safe to give my iRecruit password to my recruiter?', 'Do not send your AIA login credentials.'],
    ['en', 'Can I send my AIA password to my leader?', 'Do not send your AIA login credentials.'],
    ['ceb', 'Pwede nako ihatag ang akong AIA password sa recruiter?', 'Ayaw og send og AIA login.'],
    ['ceb', 'Pwede ko mo-share sa akong iRecruit password sa recruiter?', 'Ayaw og send og AIA login.'],
    ['tl', 'Dapat ko bang ibigay ang AIA password ko sa recruiter?', 'Huwag mong ipadala ang AIA login details mo.'],
    ['tl', 'Pwede bang i-share ang iRecruit password ko sa leader?', 'Huwag mong ipadala ang AIA login details mo.'],
  ])('%s: %s', (lang, question, safety) => {
    const reply = respond(question, lang, knowledge, now);
    expect(reply).toMatchObject({ intent: 'request_leader', reason: 'aia_password_sharing', language: lang });
    expect(reply.text).toContain(safety);
    expect(reply.text).toContain('1CMA leader');
    expect(selected.entries.find(e => e.id === 'KP-REC-01')!.answers[lang as 'en' | 'ceb' | 'tl']).toContain(safety);
    expect(reply.citation).toBeUndefined();
  });
  it('preserves credential refusal precedence rather than bypassing Claude’s guard', () => {
    expect(respond('Should I share my AIA password with my recruiter? My password is sunshine', 'en', knowledge, now))
      .toMatchObject({ intent: 'refuse', reason: 'aia_credentials' });
  });
});
describe('LOW-W1 advisor-only application FAQ', () => {
  it.each([
    'Who submits my insurance application to AIA?',
    'Does SPIKE confirm my AIA policy application?',
    'Who confirms my AIA claim registration?',
    'Who submits my AIA premium application?',
    'Who submits my AIA policyholder application?',
    'Kinsa mo submit sa akong AIA insurance application?',
    'Sino ang mag-submit ng AIA insurance application ko?',
    'Who confirms my AIA policies application?',
  ])('does not serve KP-REC-08 for %s', question => {
    expect(isAiaSubmissionQuery(question)).toBe(false);
    expect(respond(question, 'en', knowledge, now).citation?.id).not.toBe('KP-REC-08');
  });
  it.each([
    'Who submits my AIA advisor application?',
    'Does SPIKE submit or confirm my AIA application?',
    'Ang SPIKE ba ang mo-submit o mo-confirm sa akong AIA application?',
    'Ang SPIKE ba ang magsu-submit o magko-confirm ng AIA application ko?',
  ])('preserves the recruitment FAQ: %s', question => {
    expect(respond(question, 'en', knowledge, now).citation?.id).toBe('KP-REC-08');
  });
});
describe('LOW-N6 failed login handoff', () => {
  for (const platform of ['AIA', 'iRecruit']) for (const failure of ["can't", 'cannot', 'unable to', 'can’t']) {
    it(`${failure} log in to ${platform}`, () => {
      expect(respond(`I ${failure} log in to ${platform}`, 'en', knowledge, now))
        .toMatchObject({ intent: 'request_leader', reason: 'off_script' });
    });
  }
  it.each(['Where do I log in to AIA?', 'Do I need an AIA username?', 'Where do I log in to SPIKE?', 'Where is the FEP login?'])('keeps existing normal routing: %s', question => {
    const reply = respond(question, 'en', knowledge, now);
    if (/AIA/.test(question)) expect(reply.citation?.id).toBe('KP-REC-01');
    else expect(reply.citation?.id).not.toBe('KP-REC-01');
    expect(reply.intent).not.toBe('refuse');
  });
});
describe('LOW-D2/D3/D4 and INFO-1 invariants', () => {
  it('keeps the approved answers fingerprint unchanged and the inserted FAQ note current', () => {
    const fingerprint = '2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad';
    expect(createHash('sha256').update(JSON.stringify(selected.entries.map(({ id, version, answers }) => ({ id, version, answers })))).digest('hex')).toBe(fingerprint);
    expect(selected.answersSha256).toBe(fingerprint);
    expect(selected.entries.find(e => e.id === 'KP-REC-08')!.note).toContain('inserted into the runtime pack');
  });
  it('documents the real KP-REC-02 deadline without extending runtime validity', () => {
    expect(entries.find(e => e.id === 'KP-REC-02' && e.version === '0.2')!.reviewBy).toBe('2026-12-13');
    expect(readFileSync('docs/gia/owner-wording-2026-11-16.md', 'utf8')).toContain('13 December 2026');
    expect(readFileSync('docs/gia/owner-wording-implementation-2026-11-16.md', 'utf8')).toContain('13 December');
  });
  it('records the correction provenance and provides a cold-DB hook budget', () => {
    expect(readFileSync('docs/gia/cebuano-corrections-2026-11-16.md', 'utf8')).toContain('3 owner-ordered edits and 3 SPIKEDEV-suggested edits');
    expect(config.test?.hookTimeout).toBe(30000);
  });
});

import { describe, expect, it } from 'vitest';
import { isAiaCredentialDump } from './credential-safety.mjs';
import { respond, knowledge } from './engine.mjs';
import { credentialDisclosures as disclosures, aiaRegistrationQuestions, aiaLeaderQuestions, otherAccountQuestions } from '../../tests/gia/fixtures/credential-regressions';
import { storeableMessageText } from '../mvp01/engage';

describe('credential retention boundary', () => {
  it.each(disclosures)('discards %s independently of response classification', text => {
    expect(isAiaCredentialDump(text)).toBe(true);
    for (const reason of [null, 'staff_function', 'off_topic', 'internal', 'aia_credentials']) {
      expect(storeableMessageText(text, 'refuse', reason)).toBeNull();
    }
  });
  it.each(aiaRegistrationQuestions)('routes an ordinary account question to registration guidance: %s', text => {
    expect(isAiaCredentialDump(text)).toBe(false);
    const reply = respond(text, 'en', knowledge, new Date('2026-11-14T08:00:00Z'));
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-REC-01');
  });
  it.each([...aiaLeaderQuestions, ...otherAccountQuestions])('preserves leader help without AIA registration or refusal: %s', text => {
    expect(isAiaCredentialDump(text)).toBe(false);
    const reply = respond(text, 'en', knowledge, new Date('2026-11-14T08:00:00Z'));
    expect(reply.intent).toBe('request_leader');
    expect(reply.citation?.id).not.toBe('KP-REC-01');
  });
  it('does not mistake passing an AIA exam for disclosing a password', () => {
    expect(isAiaCredentialDump('How do I pass the AIA exam?')).toBe(false);
  });
  it('does not retain account payloads even when their format is ambiguous', () => {
    expect(storeableMessageText('my AIA account juan / sunshine')).toBeNull();
    expect(storeableMessageText('my AIA account: juan sunshine')).toBeNull();
  });
  it('keeps ordinary program questions', () => {
    expect(storeableMessageText('What does an AIA advisor do?')).toBe('What does an AIA advisor do?');
  });
});

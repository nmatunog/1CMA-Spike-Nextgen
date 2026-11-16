import { describe, expect, it } from 'vitest';
import { isAiaCredentialDump, isCredentialDisclosure, mayContainCredentialValue } from './credential-safety.mjs';
import { respond, knowledge } from './engine.mjs';
import { credentialDisclosures as disclosures, aiaRegistrationQuestions, aiaLeaderQuestions, otherAccountQuestions,
  genericCredentialDisclosures, storageOnlyCredentialShapes, credentialTroubleshooting, aiaJoinWithSlashes } from '../../tests/gia/fixtures/credential-regressions';
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
    const reply = respond(text, 'en', knowledge, new Date('2026-11-16T08:00:00Z'));
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-REC-01');
  });
  it.each([...aiaLeaderQuestions, ...otherAccountQuestions])('preserves leader help without AIA registration or refusal: %s', text => {
    expect(isAiaCredentialDump(text)).toBe(false);
    const reply = respond(text, 'en', knowledge, new Date('2026-11-16T08:00:00Z'));
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

  it.each(genericCredentialDisclosures)('refuses and discards a credential without an AIA label: %s', text => {
    expect(isCredentialDisclosure(text)).toBe(true);
    const reply = respond(text, 'en', knowledge, new Date('2026-11-16T08:00:00Z'));
    expect(reply.intent).toBe('refuse');
    expect(reply.reason).toBe('aia_credentials');
    for (const reason of [null, 'off_topic', 'account_help', 'off_script']) {
      expect(storeableMessageText(text, 'request_leader', reason)).toBeNull();
    }
  });
  it.each(storageOnlyCredentialShapes)('discards an ambiguous credential shape without refusing: %s', text => {
    expect(mayContainCredentialValue(text)).toBe(true);
    expect(isCredentialDisclosure(text)).toBe(false);
    expect(storeableMessageText(text, 'request_leader', 'off_script')).toBeNull();
  });
  it.each([...credentialTroubleshooting, ...otherAccountQuestions, ...aiaLeaderQuestions])('does not refuse ordinary troubleshooting: %s', text => {
    expect(isCredentialDisclosure(text)).toBe(false);
    expect(respond(text, 'en', knowledge, new Date('2026-11-16T08:00:00Z')).intent).not.toBe('refuse');
  });
  it.each(aiaJoinWithSlashes)('keeps join questions with slashes on registration guidance: %s', text => {
    const reply = respond(text, 'en', knowledge, new Date('2026-11-16T08:00:00Z'));
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-REC-01');
  });
});

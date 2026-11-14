import { describe, expect, it } from 'vitest';
import { isAiaCredentialDump } from './credential-safety.mjs';
import { respond, knowledge } from './engine.mjs';
import { storeableMessageText } from '../mvp01/engage';

describe('credential retention boundary', () => {
  const disclosures = [
    "I'm a team leader, my AIA password is sunshine",
    'homework: my aia password is sunshine', 'AIA pw: sunshine',
    'password ko sa AIA kay sunshine', 'ang akong password sa AIA kay sunshine',
    'AIA pass: sunshine', 'iRecruit pass sunshine',
    'my AIA account: juan / sunshine', 'AIA pasword: sunshine',
    'Where do I log in? My AIA password is sunshine',
    'AIA passwrod = sunshine', 'AIA password is sunshine, where do I log in?',
    'AIA creds: sunshine', 'A.I.A. password: sunshine', 'iRecruit pwd sunshine',
  ];
  it.each(disclosures)('discards %s independently of response classification', text => {
    expect(isAiaCredentialDump(text)).toBe(true);
    for (const reason of [null, 'staff_function', 'off_topic', 'internal', 'aia_credentials']) {
      expect(storeableMessageText(text, 'refuse', reason)).toBeNull();
    }
  });
  it.each([
    'I want to become an AIA advisor, where do I log in?',
    'do I need a username?', 'Where do I log in to AIA?',
    'How do I reset my AIA password?', 'Is an AIA password required?',
  ])('routes an ordinary account question to registration guidance: %s', text => {
    expect(isAiaCredentialDump(text)).toBe(false);
    const reply = respond(text, 'en', knowledge, new Date('2026-11-14T08:00:00Z'));
    expect(reply.intent).toBe('answer');
    expect(reply.citation?.id).toBe('KP-REC-01');
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

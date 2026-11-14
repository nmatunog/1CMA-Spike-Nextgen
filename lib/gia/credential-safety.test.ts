import { describe, expect, it } from 'vitest';
import { isAiaCredentialDump } from './credential-safety.mjs';
import { storeableMessageText } from '../mvp01/engage';

describe('credential retention boundary', () => {
  const disclosures = [
    "I'm a team leader, my AIA password is sunshine",
    'homework: my aia password is sunshine', 'AIA pw: sunshine',
    'password ko sa AIA kay sunshine', 'ang akong password sa AIA kay sunshine',
    'AIA creds: sunshine', 'A.I.A. password: sunshine', 'iRecruit pwd sunshine',
  ];
  it.each(disclosures)('discards %s independently of response classification', text => {
    expect(isAiaCredentialDump(text)).toBe(true);
    for (const reason of [null, 'staff_function', 'off_topic', 'internal', 'aia_credentials']) {
      expect(storeableMessageText(text, 'refuse', reason)).toBeNull();
    }
  });
  it('keeps ordinary program questions', () => {
    expect(storeableMessageText('What does an AIA advisor do?')).toBe('What does an AIA advisor do?');
  });
});

import { describe, expect, it } from 'vitest';
import {
  AIA_ASSISTED_REGISTRATION_FIELDS,
  assertAiaAssistedFieldsHaveNoCredentials,
  mapAssistedRegistrationFields,
} from './aia-assisted-fields';

describe('AIA assisted registration field config', () => {
  it('keeps a single shared field order without credential fields', () => {
    expect(AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => field.id)).toEqual([
      'honorifics',
      'first_name',
      'last_name',
      'date_of_birth',
      'email',
      'mobile',
      'applying_to_be',
      'city',
    ]);
    expect(() => assertAiaAssistedFieldsHaveNoCredentials()).not.toThrow();
    expect(JSON.stringify(AIA_ASSISTED_REGISTRATION_FIELDS)).not.toMatch(/password|credential|secret|pin|otp|agent.?code/i);
  });

  it('maps consented candidate details into that order without inventing DOB or city', () => {
    const fields = mapAssistedRegistrationFields({
      name: 'Synthetic Ada Recruiter',
      email: 'ada@example.test',
      phone: '+639170000001',
    });
    expect(fields.map((field) => field.id)).toEqual(AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => field.id));
    expect(fields[0]).toMatchObject({ id: 'honorifics', value: '', captured: false });
    expect(fields[1]).toMatchObject({ id: 'first_name', value: 'Synthetic', captured: true });
    expect(fields[2]).toMatchObject({ id: 'last_name', value: 'Ada Recruiter', captured: true });
    expect(fields[3]).toMatchObject({ id: 'date_of_birth', value: '', captured: false });
    expect(fields[4]).toMatchObject({ id: 'email', value: 'ada@example.test', captured: true });
    expect(fields[5]).toMatchObject({ id: 'mobile', value: '+639170000001', captured: true });
    expect(fields[6]).toMatchObject({ id: 'applying_to_be', value: '', captured: false });
    expect(fields[7]).toMatchObject({ id: 'city', value: '', captured: false });
  });
});

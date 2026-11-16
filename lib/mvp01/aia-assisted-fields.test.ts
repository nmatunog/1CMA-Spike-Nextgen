import { describe, expect, it } from 'vitest';
import {
  AIA_ASK_ON_FORM,
  AIA_ASSISTED_CANDIDATE_ON_FORM,
  AIA_ASSISTED_REGISTRATION_FIELDS,
  AIA_MOBILE_FORMAT_HINT,
  assertAiaAssistedFieldsHaveNoCredentials,
  mapAssistedRegistrationFields,
} from './aia-assisted-fields';

describe('AIA assisted registration field config', () => {
  it('matches the live join-us-now field order without credential or captcha copy fields', () => {
    expect(AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => field.id)).toEqual([
      'honorifics',
      'first_name',
      'last_name',
      'date_of_birth',
      'email',
      'mobile',
      'applying_to_be',
      'preferred_location',
    ]);
    expect(AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => field.label)).toEqual([
      'Honorifics',
      'First Name',
      'Last Name',
      'Date of Birth',
      'Email Address',
      'Mobile Number',
      "I'm Applying To Be",
      'Preferred Location',
    ]);
    expect(AIA_ASSISTED_REGISTRATION_FIELDS[0].options).toEqual(['Mr', 'Miss', 'Mrs']);
    expect(AIA_ASSISTED_REGISTRATION_FIELDS[6].options).toEqual(['Full Time', 'Part Time']);
    expect(AIA_ASSISTED_REGISTRATION_FIELDS[5].formatHint).toBe(AIA_MOBILE_FORMAT_HINT);
    expect(AIA_ASSISTED_CANDIDATE_ON_FORM.map((item) => item.id)).toEqual(['consent', 'recaptcha']);
    expect(AIA_ASSISTED_CANDIDATE_ON_FORM.every((item) => /candidate on AIA's form/i.test(item.note))).toBe(true);
    expect(() => assertAiaAssistedFieldsHaveNoCredentials()).not.toThrow();
    expect(JSON.stringify(AIA_ASSISTED_REGISTRATION_FIELDS)).not.toMatch(/password|credential|secret|pin|otp|agent.?code/i);
  });

  it('marks collected vs ask-on-form and never invents DOB, honorifics, applying-to-be, or city', () => {
    const fields = mapAssistedRegistrationFields({
      name: 'Synthetic Ada Recruiter',
      email: 'ada@example.test',
      phone: '+639170000001',
    });
    expect(fields.map((field) => field.id)).toEqual(AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => field.id));
    expect(fields[0]).toMatchObject({ id: 'honorifics', captured: false, source: 'ask_on_aia_form', prompt: AIA_ASK_ON_FORM, value: '' });
    expect(fields[1]).toMatchObject({ id: 'first_name', value: 'Synthetic', captured: true, source: 'collected' });
    expect(fields[2]).toMatchObject({ id: 'last_name', value: 'Ada Recruiter', captured: true, source: 'collected' });
    expect(fields[3]).toMatchObject({ id: 'date_of_birth', captured: false, source: 'ask_on_aia_form', prompt: AIA_ASK_ON_FORM, value: '' });
    expect(fields[4]).toMatchObject({ id: 'email', value: 'ada@example.test', captured: true, source: 'collected' });
    expect(fields[5]).toMatchObject({ id: 'mobile', value: '+639170000001', captured: true, formatHint: AIA_MOBILE_FORMAT_HINT });
    expect(fields[6]).toMatchObject({ id: 'applying_to_be', captured: false, source: 'ask_on_aia_form', prompt: AIA_ASK_ON_FORM });
    expect(fields[7]).toMatchObject({ id: 'preferred_location', captured: false, source: 'ask_on_aia_form', prompt: AIA_ASK_ON_FORM });

    const withDob = mapAssistedRegistrationFields({
      name: 'Synthetic Ada Recruiter',
      dateOfBirth: '1990-01-02',
    });
    expect(withDob[3]).toMatchObject({ id: 'date_of_birth', value: '1990-01-02', captured: true, source: 'collected' });
  });
});

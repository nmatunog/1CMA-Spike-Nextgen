/**
 * Shared AIA iRecruit / join-us field order for C1 Command Center and G1 (#19).
 * Import this list; do not fork it. Update here once AIA confirms the live fields.
 * Never add credentials, passwords, PINs, agent codes, or iRecruit login fields.
 *
 * AIA join-us-now form order (Nilo / SPIKEDEV, 13 Nov 2026): Honorifics, First Name,
 * Last Name, Date of Birth, Email Address, Mobile Number, I'm Applying To Be,
 * Preferred Location (City). Consent checkbox and captcha stay on AIA's form.
 * URL prefill is not supported. G1 must not collect DOB on the landing.
 */
export const AIA_ASSISTED_REGISTRATION_FIELDS = [
  { id: 'honorifics', label: 'Honorifics', candidateKey: null },
  { id: 'first_name', label: 'First Name', candidateKey: 'name_first' },
  { id: 'last_name', label: 'Last Name', candidateKey: 'name_last' },
  { id: 'date_of_birth', label: 'Date of Birth', candidateKey: null },
  { id: 'email', label: 'Email Address', candidateKey: 'email' },
  { id: 'mobile', label: 'Mobile Number', candidateKey: 'phone' },
  { id: 'applying_to_be', label: "I'm Applying To Be", candidateKey: null },
  { id: 'city', label: 'Preferred Location (City)', candidateKey: null },
] as const;

export type AiaAssistedFieldId = (typeof AIA_ASSISTED_REGISTRATION_FIELDS)[number]['id'];
export type AiaAssistedField = {
  id: AiaAssistedFieldId;
  label: string;
  value: string;
  captured: boolean;
};

const CREDENTIAL_FIELD = /password|credential|secret|pin|otp|agent.?code|access.?code|irecruit/i;

export function isAiaAssistedFieldId(value: unknown): value is AiaAssistedFieldId {
  return typeof value === 'string' && AIA_ASSISTED_REGISTRATION_FIELDS.some((field) => field.id === value);
}

export function assertAiaAssistedFieldsHaveNoCredentials() {
  for (const field of AIA_ASSISTED_REGISTRATION_FIELDS) {
    if (CREDENTIAL_FIELD.test(field.id) || CREDENTIAL_FIELD.test(field.label)) {
      throw new Error('invalid');
    }
  }
}

export function splitCandidateName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function mapAssistedRegistrationFields(candidate: { name?: string | null; email?: string | null; phone?: string | null }): AiaAssistedField[] {
  assertAiaAssistedFieldsHaveNoCredentials();
  const split = splitCandidateName(String(candidate.name || ''));
  const values: Record<string, string> = {
    name_first: split.first,
    name_last: split.last,
    email: String(candidate.email || '').trim(),
    phone: String(candidate.phone || '').trim(),
  };
  return AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => {
    const value = field.candidateKey ? (values[field.candidateKey] || '') : '';
    return { id: field.id, label: field.label, value, captured: value.length > 0 };
  });
}

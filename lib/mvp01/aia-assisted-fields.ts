/**
 * Shared AIA join-us-now copy-assist field order for C1 Command Center and G1 (#19).
 * G1 mirrors this file byte-for-byte. Do not fork.
 *
 * Evidence (SPIKEDEV, read-only headless Chrome, synthetic `reference`):
 * the live form is Honorifics, First Name, Last Name, Date of Birth, Email Address,
 * Mobile Number, I'm Applying To Be, Preferred Location, then consent + reCAPTCHA.
 * Applicant URL prefill is not supported. The page reads `reference`, `cmpid`,
 * `scroll`, and `clickid`. A valid reference greets
 * "Hi! I'm <recruiter name>, your assigned Life Planner".
 *
 * Never add credentials, passwords, PINs, agent codes, or iRecruit login fields.
 * Never collect new PII here. Date of Birth is shown only when it already exists
 * on the consented candidate record.
 */
export const AIA_ASK_ON_FORM = "ask the candidate on AIA's form";
export const AIA_MOBILE_FORMAT_HINT = '639XXXXXXXXX';

export const AIA_ASSISTED_REGISTRATION_FIELDS = [
  { id: 'honorifics', label: 'Honorifics', options: ['Mr', 'Miss', 'Mrs'], candidateKey: null, formatHint: null },
  { id: 'first_name', label: 'First Name', options: null, candidateKey: 'name_first', formatHint: null },
  { id: 'last_name', label: 'Last Name', options: null, candidateKey: 'name_last', formatHint: null },
  { id: 'date_of_birth', label: 'Date of Birth', options: null, candidateKey: 'dateOfBirth', formatHint: null },
  { id: 'email', label: 'Email Address', options: null, candidateKey: 'email', formatHint: null },
  { id: 'mobile', label: 'Mobile Number', options: null, candidateKey: 'phone', formatHint: AIA_MOBILE_FORMAT_HINT },
  { id: 'applying_to_be', label: "I'm Applying To Be", options: ['Full Time', 'Part Time'], candidateKey: null, formatHint: null },
  { id: 'preferred_location', label: 'Preferred Location', options: null, candidateKey: null, formatHint: null },
] as const;

/** Fields 9–10. The candidate completes these on AIA's form; they are not copy-assist fields. */
export const AIA_ASSISTED_CANDIDATE_ON_FORM = [
  { id: 'consent', label: 'Consent checkbox', note: "Done by the candidate on AIA's form. Not collected or copied here." },
  { id: 'recaptcha', label: 'reCAPTCHA', note: "Done by the candidate on AIA's form. Not collected or copied here." },
] as const;

export type AiaAssistedFieldId = (typeof AIA_ASSISTED_REGISTRATION_FIELDS)[number]['id'];
export type AiaAssistedField = {
  id: AiaAssistedFieldId;
  label: string;
  value: string;
  captured: boolean;
  source: 'collected' | 'ask_on_aia_form';
  prompt: string;
  formatHint: string | null;
  options: readonly string[] | null;
};

export type AiaAssistedCandidate = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Pass only if already stored on the consented record. Never invent or newly collect. */
  dateOfBirth?: string | null;
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

export function mapAssistedRegistrationFields(candidate: AiaAssistedCandidate = {}): AiaAssistedField[] {
  assertAiaAssistedFieldsHaveNoCredentials();
  const split = splitCandidateName(String(candidate.name || ''));
  const values: Record<string, string> = {
    name_first: split.first,
    name_last: split.last,
    email: String(candidate.email || '').trim(),
    phone: String(candidate.phone || '').trim(),
    dateOfBirth: String(candidate.dateOfBirth || '').trim(),
  };
  return AIA_ASSISTED_REGISTRATION_FIELDS.map((field) => {
    const value = field.candidateKey ? (values[field.candidateKey] || '') : '';
    const captured = value.length > 0;
    return {
      id: field.id,
      label: field.label,
      value,
      captured,
      source: captured ? 'collected' : 'ask_on_aia_form',
      prompt: captured ? value : AIA_ASK_ON_FORM,
      formatHint: field.formatHint,
      options: field.options,
    };
  });
}

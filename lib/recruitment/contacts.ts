const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: string | null | undefined) {
  const trimmed = (value || '').trim().toLowerCase();
  return trimmed || '';
}

export function isValidEmail(value: string) {
  return EMAIL.test(value) && !/\s/.test(value) && value.length <= 120;
}

/** Digits-only then PH local 09XXXXXXXXX / 9XXXXXXXXX → +63. */
export function normalizePhone(value: string | null | undefined) {
  const raw = (value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('63') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `+63${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return '';
}

export function isValidPhone(normalized: string) {
  return /^\+\d{8,15}$/.test(normalized);
}

export function looksLikeSecretHeader(header: string) {
  const key = header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return /^(code|access_code|accesscode|l1_code|l2_code|secret|password|token|otp|raw_code|redemption_code|entry_code)$/.test(key);
}

export const ALLOWED_IMPORT_HEADERS = [
  'name',
  'email',
  'phone',
  'mobile',
  'source',
  'versa_lead_ref',
  'spike_learner_ref',
  'program_interest',
  'offering',
  'code_status',
  'consent',
  'consent_status',
] as const;

export const ALLOWED_SOURCES = ['versa', 'messenger', 'manual', 'csv', 'gia_web_session'] as const;

export function canonicalHeader(header: string) {
  const key = header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'mobile') return 'phone';
  if (key === 'versaleadref') return 'versa_lead_ref';
  if (key === 'spikelearnerref') return 'spike_learner_ref';
  return key;
}

export function isAllowedSource(value: string) {
  return (ALLOWED_SOURCES as readonly string[]).includes(value);
}

export function isAllowedRef(value: string) {
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value);
}

export const CODE_STATUSES = ['issued', 'redeemed', 'revoked', 'unknown'] as const;

export function isCodeStatus(value: string) {
  return (CODE_STATUSES as readonly string[]).includes(value);
}

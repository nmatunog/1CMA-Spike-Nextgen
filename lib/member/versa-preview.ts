/** Synthetic welcome context only. Never authentication, code validation or attribution. */
export const VERSA_PREVIEW_COOKIE = 'spike_versa_preview';
export const VERSA_FIELDS = ['mfn', 'mln', 'me', 'sfn', 'sln', 'code'] as const;
export type VersaPreview = Record<typeof VERSA_FIELDS[number], string>;
export function previewHost(host: string) {
  if (process.env.VERSA_GET_STAGING_ENABLED !== 'true') return false;
  return host === 'nextgen-staging.nmatunog.workers.dev' ||
    (process.env.MEMBER_LOCAL_DEMO === 'true' && ['localhost', '127.0.0.1'].includes(host.split(':')[0]));
}
export function parseVersaPreview(params: URLSearchParams): VersaPreview | null {
  if ([...params.keys()].some(key => !VERSA_FIELDS.includes(key as typeof VERSA_FIELDS[number]))) return null;
  const result = {} as VersaPreview;
  for (const key of VERSA_FIELDS) {
    const values = params.getAll(key);
    if (values.length !== 1 || !values[0].trim() || values[0].length > (key === 'me' ? 120 : key === 'code' ? 32 : 80) || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffd]/.test(values[0])) return null;
    result[key] = values[0].trim();
  }
  // This receiver deliberately accepts only fictional staging fixtures.
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/i.test(result.me) ||
      !/^(FREE|PRO)-SYN[0-9]{5}$/.test(result.code)) return null;
  return result;
}
export function decodeVersaPreview(value: string | undefined): VersaPreview | null {
  if (!value || value.length > 3000) return null;
  try { return parseVersaPreview(new URLSearchParams(value)); } catch { return null; }
}

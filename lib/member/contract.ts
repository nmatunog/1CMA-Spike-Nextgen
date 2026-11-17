export const HANDOFF_FIELDS = ['mfn', 'mln', 'me', 'sfn', 'sln', 'code'] as const;
import { syntheticCodeFormat, type CodeFormat } from './code-format';
export type Handoff = Record<typeof HANDOFF_FIELDS[number], string> & { extra: Record<string, string> };
export const FIELD_LABELS = { mfn: 'Member first name', mln: 'Member last name', me: 'SPIKE username (email)', sfn: 'Sponsor first name', sln: 'Sponsor last name', code: 'SPIKE access code' };
const controls = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
export function parseHandoff(params: URLSearchParams, codeFormat: CodeFormat = syntheticCodeFormat): Handoff {
  if (params.toString().length > 8192 || [...params].length > 26) throw new Error('invalid_handoff');
  const values = Object.create(null) as Record<string, string>;
  for (const [key, value] of params) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || /^(constructor|prototype|password|passwd|authorization|secret|access_token|refresh_token)$/i.test(key) || Object.hasOwn(values, key) || controls.test(value)) throw new Error('invalid_handoff');
    if (HANDOFF_FIELDS.some(field => field === key.toLowerCase() && field !== key)) throw new Error('invalid_handoff');
    const limit = key === 'me' ? 254 : key === 'code' ? 64 : HANDOFF_FIELDS.includes(key as typeof HANDOFF_FIELDS[number]) ? 80 : 512;
    const core = HANDOFF_FIELDS.includes(key as typeof HANDOFF_FIELDS[number]);
    if ((core && !value.trim()) || value.length > limit) throw new Error('invalid_handoff');
    values[key] = core ? value.trim() : value;
  }
  if (HANDOFF_FIELDS.some(key => !Object.hasOwn(values, key))) throw new Error('invalid_handoff');
  const code = codeFormat.normalize(values.code);
  if (!validEmail(values.me) || !code || code.length > 64 || controls.test(code)) throw new Error('invalid_handoff');
  const extra = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(values)) if (!HANDOFF_FIELDS.includes(key as typeof HANDOFF_FIELDS[number])) extra[key] = values[key];
  return { mfn: values.mfn, mln: values.mln, me: values.me.toLowerCase(), sfn: values.sfn, sln: values.sln, code, extra };
}
export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value);
}
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length >= 8 && value.length <= 256 && !controls.test(value);
}

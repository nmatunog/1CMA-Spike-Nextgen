import { VERSA_FLAG_ENV } from './constants.js';

/**
 * Versa CSV verification is off unless explicitly enabled.
 * Unset, empty, "0", "false", "off" => disabled.
 * @param {Record<string, string | undefined> | null | undefined} env
 */
export function isVersaCsvCodeGateEnabled(env) {
  const raw = String(env?.[VERSA_FLAG_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

import { REASONS } from './constants.js';
import { resolveOfferingPolicy } from './offerings.js';

/**
 * Catalog-driven access gate — the CSV match is never payment proof.
 * Free L1 / FEP: no payment check (and no code — handled in verify()).
 * Paid L2: paymentVerified from an imported `pro` row (Nilo, Nov 12)
 * or an authorized provider. Never from the HTTP body.
 * Future coded offerings: requireCode is enforced by verify(); payment
 * follows paymentRequired on the catalog entry.
 *
 * @param {{
 *   level: string,
 *   offeringId?: string | null,
 *   paymentVerified?: boolean,
 *   prerequisiteOk?: boolean,
 * }} input
 */
export function evaluateExistingOfferingGate(input) {
  const policy = resolveOfferingPolicy(input?.offeringId, input?.level);
  if (policy.paymentRequired) {
    if (input?.paymentVerified === true && input?.prerequisiteOk !== false) {
      return { ok: true };
    }
    return { ok: false, reason: REASONS.gate_unsatisfied };
  }
  if (policy.level === 'L1' || policy.access === 'free' || policy.access === 'coded') {
    return { ok: true };
  }
  return { ok: false, reason: REASONS.wrong_offering };
}

import { createSessionIdentityProvider } from './adapters.js';
import { resolveIntended } from './offerings.js';
import { verifyVersaCode } from './verifyRedeem.js';

function asIdentityInput(authenticatedIdentity) {
  if (!authenticatedIdentity) return {};
  if (typeof authenticatedIdentity.resolve === 'function') {
    return { identityProvider: authenticatedIdentity };
  }
  if (authenticatedIdentity.userId || authenticatedIdentity.email) {
    return { identity: authenticatedIdentity };
  }
  return {
    identityProvider: createSessionIdentityProvider(authenticatedIdentity),
  };
}

/**
 * Portable verify: does not consume the code.
 *
 * verify(code, authenticatedIdentity, intendedCourse, intendedLevel) → result
 *
 * `intendedCourse` is a program_route (`spike-interns` | `ra-spike`) or an
 * offering id (`financial-literacy` | `fep`). Free L1 / FEP need no code.
 *
 * @param {string} [code]
 * @param {object} authenticatedIdentity
 * @param {string} intendedCourse
 * @param {string} intendedLevel
 * @param {object} [options]
 */
export async function verify(code, authenticatedIdentity, intendedCourse, intendedLevel, options = {}) {
  const expected = resolveIntended(intendedCourse, intendedLevel, options);
  return verifyVersaCode({
    env: options.env,
    admin: options.admin,
    request: options.request,
    submittedCode: code,
    grantor: options.grantor,
    prerequisiteOk: options.prerequisiteOk,
    logger: options.logger,
    expected,
    consume: false,
    inferFromPlanSlug: options.inferFromPlanSlug === true,
    clientSpecifiedOffering: options.clientSpecifiedOffering === true,
    now: options.now,
    ...asIdentityInput(authenticatedIdentity),
  });
}

/**
 * Portable redeem: single-use, server-side consume after the same checks as verify().
 * Existing same-course entitlements are preserved (already_granted).
 * Never grants a different program_route than the inventory row.
 */
export async function redeem(code, authenticatedIdentity, intendedCourse, intendedLevel, options = {}) {
  const expected = resolveIntended(intendedCourse, intendedLevel, options);
  return verifyVersaCode({
    env: options.env,
    admin: options.admin,
    request: options.request,
    submittedCode: code,
    grantor: options.grantor,
    prerequisiteOk: options.prerequisiteOk,
    logger: options.logger,
    expected,
    consume: true,
    inferFromPlanSlug: options.inferFromPlanSlug === true,
    clientSpecifiedOffering: options.clientSpecifiedOffering === true,
    now: options.now,
    ...asIdentityInput(authenticatedIdentity),
  });
}

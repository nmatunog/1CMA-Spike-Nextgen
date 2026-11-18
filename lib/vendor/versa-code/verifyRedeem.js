import {
  DEFAULT_L1_OFFERING_ID,
  GENERIC_DENY_MESSAGE,
  REASONS,
  VERSA_L1_OFFERING_ENV,
} from './constants.js';
import { createPortableEntitlementGrantor, createSessionIdentityProvider } from './adapters.js';
import { digestCode, normalizeEmail, normalizeSubmittedCode, requireHmacSecret } from './digest.js';
import { isVersaCsvCodeGateEnabled } from './flag.js';
import { consumeAndGrant, findInventoryByDigest, recordAttempt } from './inventory.js';
import { createVersaLogger } from './log.js';
import { resolveOfferingPolicy } from './offerings.js';
import { evaluateExistingOfferingGate } from './offeringGate.js';
import {
  importedProRowImpliesPaid,
  matchIntendedToPlanSlug,
  offeringsFromInventoryRow,
  resolveExpectedFromPlanSlug,
  resolvePlanSlug,
} from './planSlug.js';
import { assertDurableRateLimit, rateLimitKey, recordDurableFail } from './rateLimit.js';

function expectedL1Offering(env) {
  return String(env?.[VERSA_L1_OFFERING_ENV] ?? '').trim() || DEFAULT_L1_OFFERING_ID;
}

function sessionIsVerified(identity) {
  return identity?.emailConfirmed === true || identity?.versaHandoffVerified === true;
}

/**
 * Versa export has no email/owner. Identity binds at redemption: the first
 * authenticated, verified account claims an unbound code. A typed/unverified
 * email is never proof.
 *
 * @param {object} row
 * @param {import('./adapters.js').VerifiedIdentity} identity
 */
export function identityMatchesImportedRow(row, identity) {
  const sessionUserId = identity?.userId ? String(identity.userId) : '';
  if (!sessionUserId) return false;
  if (!sessionIsVerified(identity)) return false;

  const verifiedEmail = normalizeEmail(row?.verified_email);
  const verifiedUserId = row?.verified_user_id ? String(row.verified_user_id) : '';
  const sessionEmail = normalizeEmail(identity?.email);
  const rowLead = String(row?.versa_lead_ref ?? '').trim();
  const handoffLead = String(identity?.versaLeadRef ?? '').trim();
  const unbound = !verifiedEmail && !verifiedUserId;

  if (unbound) {
    return true;
  }

  if (verifiedUserId && verifiedUserId === sessionUserId) return true;
  if (verifiedEmail && sessionEmail && verifiedEmail === sessionEmail) return true;
  if (identity?.versaHandoffVerified === true && handoffLead && rowLead && handoffLead === rowLead) {
    return true;
  }
  return false;
}

function offeringMatches(row, expected) {
  if (!expected?.level) return true;
  if (String(row.level).toUpperCase() !== String(expected.level).toUpperCase()) return false;
  if (expected.offeringId && String(row.offering_id) !== String(expected.offeringId)) return false;
  return true;
}

function programRouteMatches(row, expected) {
  if (!expected?.programRoute) return true;
  return String(row.program_route) === String(expected.programRoute);
}

function rowUnavailableReason(row, now = Date.now()) {
  const status = String(row?.status ?? '').toLowerCase();
  if (status === 'revoked' || status === 'invalid') return REASONS.revoked;
  if (status === 'expired') return REASONS.expired;
  if (row?.expires_at && new Date(row.expires_at).getTime() < now) return REASONS.expired;
  if (status === 'redeemed') return REASONS.reused;
  if (status !== 'available') return REASONS.revoked;
  return null;
}

/**
 * Portable verify + redeem. Host portals pass IdentityProvider + EntitlementGrantor.
 * @param {{
 *   env: Record<string, string>,
 *   admin: import('@supabase/supabase-js').SupabaseClient,
 *   request?: Request | null,
 *   submittedCode: string,
 *   identity?: import('./adapters.js').VerifiedIdentity,
 *   identityProvider?: import('./adapters.js').IdentityProvider,
 *   grantor?: import('./adapters.js').EntitlementGrantor,
 *   expected?: { level?: string, offeringId?: string | null, programRoute?: string },
 *   prerequisiteOk?: boolean,
 *   consume?: boolean,
 *   inferFromPlanSlug?: boolean,
 *   clientSpecifiedOffering?: boolean,
 *   now?: number,
 *   logger?: ReturnType<typeof createVersaLogger>,
 * }} input
 */
export async function verifyVersaCode(input) {
  const logger = input.logger || createVersaLogger();
  const env = input.env || {};
  const consume = input.consume !== false;
  const now = input.now ?? Date.now();
  const submittedCode = normalizeSubmittedCode(input.submittedCode);

  if (!isVersaCsvCodeGateEnabled(env)) {
    return { ok: false, reason: REASONS.flag_off, message: GENERIC_DENY_MESSAGE };
  }

  const identity = input.identityProvider
    ? await input.identityProvider.resolve()
    : input.identity || (await createSessionIdentityProvider({}).resolve());

  const rlKey = rateLimitKey(input.request, identity);
  const limited = await assertDurableRateLimit({ admin: input.admin, key: rlKey });
  if (!limited.ok) {
    logger.warn({ event: 'versa_denied', reason: REASONS.rate_limited });
    return { ok: false, reason: REASONS.rate_limited, message: GENERIC_DENY_MESSAGE };
  }

  if (!identity?.userId || !sessionIsVerified(identity)) {
    await recordDurableFail({ admin: input.admin, key: rlKey });
    logger.warn({ event: 'versa_denied', reason: REASONS.unverified_identity });
    return { ok: false, reason: REASONS.unverified_identity, message: GENERIC_DENY_MESSAGE };
  }

  const expected = input.expected || {
    level: 'L1',
    offeringId: expectedL1Offering(env),
  };
  const policy = resolveOfferingPolicy(expected.offeringId, expected.level);

  if (!submittedCode && policy.requiresCode === false) {
    if (
      expected.programRoute
      && policy.courses?.length
      && !policy.courses.includes(String(expected.programRoute))
    ) {
      await recordDurableFail({ admin: input.admin, key: rlKey });
      logger.warn({ event: 'versa_denied', reason: REASONS.wrong_program_route });
      return { ok: false, reason: REASONS.wrong_program_route, message: GENERIC_DENY_MESSAGE };
    }
    logger.info({ event: 'versa_code_not_required', offeringId: policy.id, level: policy.level });
    return {
      ok: true,
      reason: REASONS.code_not_required,
      alreadyGranted: false,
      offering: policy,
      message: 'This offering is free — no access code is required.',
    };
  }

  if (!submittedCode) {
    await recordDurableFail({ admin: input.admin, key: rlKey });
    logger.warn({ event: 'versa_denied', reason: REASONS.unknown });
    return { ok: false, reason: REASONS.unknown, message: GENERIC_DENY_MESSAGE };
  }

  let secret;
  try {
    secret = requireHmacSecret(env);
  } catch {
    logger.error({ event: 'versa_misconfigured', reason: REASONS.missing_secret });
    return { ok: false, reason: REASONS.missing_secret, message: GENERIC_DENY_MESSAGE };
  }

  const digest = await digestCode(secret, submittedCode);
  const row = await findInventoryByDigest(input.admin, digest);
  if (!row) {
    await recordDurableFail({ admin: input.admin, key: rlKey });
    await recordAttempt(input.admin, { actorUserId: identity.userId, reason: REASONS.unknown });
    logger.warn({ event: 'versa_denied', reason: REASONS.unknown });
    return { ok: false, reason: REASONS.unknown, message: GENERIC_DENY_MESSAGE };
  }

  const deny = async (reason) => {
    await recordDurableFail({ admin: input.admin, key: rlKey });
    await recordAttempt(input.admin, {
      actorUserId: identity.userId,
      inventoryId: row.id,
      reason,
      offeringId: row.offering_id,
      level: row.level,
      programRoute: row.program_route,
    });
    logger.warn({ event: 'versa_denied', reason, inventoryId: row.id });
    return { ok: false, reason, message: GENERIC_DENY_MESSAGE, inventoryId: row.id };
  };

  if (!identityMatchesImportedRow(row, identity)) {
    return deny(REASONS.wrong_identity);
  }

  const mapping = resolvePlanSlug(row.plan_slug);
  if (mapping) {
    const matchExpected = resolveExpectedFromPlanSlug(mapping, expected, input);
    const intended = matchIntendedToPlanSlug(mapping, matchExpected);
    if (!intended.ok) return deny(intended.reason);
  } else {
    if (!programRouteMatches(row, expected)) {
      return deny(REASONS.wrong_program_route);
    }
    if (!offeringMatches(row, expected)) {
      return deny(REASONS.wrong_offering);
    }
  }

  const grantor = input.grantor || createPortableEntitlementGrantor(input.admin, { env, now });
  const bundle = offeringsFromInventoryRow(row);
  const termLimited = bundle.some((offering) => offering.termLimited);
  const existingFlags = await Promise.all(
    bundle.map((offering) => grantor.hasExisting(identity.userId, offering.offeringId, offering.programRoute)),
  );
  if (!termLimited && bundle.length && existingFlags.every(Boolean)) {
    logger.info({ event: 'versa_already_granted', inventoryId: row.id, bypass: true });
    return {
      ok: true,
      reason: REASONS.already_granted,
      alreadyGranted: true,
      row,
      message: 'Access verified',
    };
  }

  const unavailable = rowUnavailableReason(row, now);
  if (unavailable === REASONS.reused) {
    // Nilo Nov 12 2:09 PM: PRO codes are strictly single-use. Redeem never
    // re-succeeds, including the same learner during an active term.
    if (termLimited) {
      return deny(REASONS.reused);
    }
    if (identity.userId && String(row.redeemed_by) === String(identity.userId)) {
      logger.info({ event: 'versa_already_granted', inventoryId: row.id });
      return {
        ok: true,
        reason: REASONS.already_granted,
        alreadyGranted: true,
        row,
        message: 'Access verified',
      };
    }
    return deny(REASONS.reused);
  }
  if (unavailable) return deny(unavailable);

  // Imported `pro` row is the payment signal (Nilo, Nov 12). No host input.
  const paymentVerified = importedProRowImpliesPaid(row, env);
  const gate = evaluateExistingOfferingGate({
    level: row.level,
    offeringId: row.offering_id,
    paymentVerified,
    prerequisiteOk: input.prerequisiteOk,
  });
  if (!gate.ok) return deny(gate.reason);

  if (!consume) {
    return { ok: true, reason: REASONS.valid, row, message: 'Access verified' };
  }

  const granted = await consumeAndGrant(input.admin, {
    id: row.id,
    userId: identity.userId,
    grantor,
    env,
    now,
  });
  if (!granted?.ok) {
    return deny(granted?.reason || REASONS.reused);
  }

  logger.info({
    event: granted.already_granted ? 'versa_already_granted' : 'versa_redeemed',
    inventoryId: granted.row?.id || row.id,
    level: granted.row?.level || row.level,
    offeringId: granted.row?.offering_id || row.offering_id,
    programRoute: granted.row?.program_route || row.program_route,
  });

  return {
    ok: true,
    reason: granted.already_granted ? REASONS.already_granted : REASONS.valid,
    alreadyGranted: Boolean(granted.already_granted),
    row: granted.row || row,
    entitlement: granted.entitlement,
    message: 'Access verified',
  };
}

export { GENERIC_DENY_MESSAGE };

import { normalizeEmail } from './digest.js';
import {
  entitlementAllowsAccess,
  stackedExpiryIso,
  versaProGraceDays,
  versaProPeriodDays,
} from './entitlement.js';
import { grantOfferingsFromRow, listEntitlementsForUser } from './inventory.js';
import { offeringsFromInventoryRow } from './planSlug.js';

/**
 * IdentityProvider
 *
 * A verified identity MUST come from:
 * - the chosen auth provider (session user id, and email only when that
 *   provider has confirmed it — e.g. email_confirmed_at), or
 * - a Versa-verified handoff payload (versa_lead_ref + verified flag).
 *
 * A typed / unverified email is never proof. This module does not flip
 * emailConfirm:true on portal signup.
 *
 * @typedef {{
 *   userId: string | null,
 *   email: string | null,
 *   emailConfirmed: boolean,
 *   versaHandoffVerified: boolean,
 *   versaLeadRef: string | null,
 *   source: 'auth_provider' | 'versa_handoff' | 'unverified',
 * }} VerifiedIdentity
 *
 * @typedef {{ resolve: () => Promise<VerifiedIdentity> }} IdentityProvider
 */

/**
 * Auth-provider session. Email is proven only when the provider confirmed it.
 * @param {{
 *   userId?: string | null,
 *   email?: string | null,
 *   emailConfirmed?: boolean,
 *   emailConfirmedAt?: string | null,
 * }} session
 * @returns {IdentityProvider}
 */
export function createSessionIdentityProvider(session = {}) {
  return {
    async resolve() {
      const userId = session.userId ? String(session.userId) : null;
      const emailConfirmed = session.emailConfirmed === true || Boolean(session.emailConfirmedAt);
      return {
        userId,
        email: normalizeEmail(session.email) || null,
        emailConfirmed,
        versaHandoffVerified: false,
        versaLeadRef: null,
        source: userId ? 'auth_provider' : 'unverified',
      };
    },
  };
}

/**
 * Mock Versa handoff payload. Plug the real landing-page payload in later.
 * @param {{
 *   versaLeadRef: string,
 *   verified?: boolean,
 *   userId?: string | null,
 *   verifiedUserId?: string | null,
 *   verifiedEmail?: string | null,
 * }} payload
 * @returns {IdentityProvider}
 */
export function createMockVersaHandoffIdentityProvider(payload = {}) {
  return {
    async resolve() {
      const verified = payload.verified === true;
      const userId = payload.userId || payload.verifiedUserId || null;
      return {
        userId: userId ? String(userId) : null,
        email: normalizeEmail(payload.verifiedEmail) || null,
        emailConfirmed: false,
        versaHandoffVerified: verified,
        versaLeadRef: payload.versaLeadRef ? String(payload.versaLeadRef) : null,
        source: verified ? 'versa_handoff' : 'unverified',
      };
    },
  };
}

/**
 * EntitlementGrantor
 *
 * Grant runs inside the redeem transaction only after identity match.
 * Returning learners with an existing portable entitlement bypass redemption.
 * Destination hosts (intern portal, RA-SPIKE) plug in later — mocks never set
 * profiles.role = INTERN.
 *
 * @typedef {{
 *   hasExisting: (userId: string, offeringId: string, programRoute?: string) => Promise<boolean>,
 *   grant: (input: {
 *     userId: string,
 *     row: object,
 *     paymentVerified?: boolean,
 *     env?: Record<string, string | undefined>,
 *     now?: number,
 *     extend?: boolean,
 *     skipOfferingId?: string | null,
 *   }) => Promise<object>,
 * }} EntitlementGrantor
 */

/** Portable store: versa_entitlements only. */
export function createPortableEntitlementGrantor(admin, clock = {}) {
  return {
    async hasExisting(userId, offeringId, programRoute) {
      const rows = await listEntitlementsForUser(admin, userId);
      const graceDays = versaProGraceDays(clock.env);
      const now = clock.now ?? Date.now();
      return rows.some(
        (row) =>
          String(row.offering_id) === String(offeringId) &&
          (!programRoute || String(row.program_route) === String(programRoute)) &&
          entitlementAllowsAccess(row, { now, graceDays }),
      );
    },
    async grant({ userId, row, env, now, extend = true, skipOfferingId = null }) {
      return grantOfferingsFromRow(admin, {
        userId,
        row,
        env: env || clock.env,
        now: now ?? clock.now ?? Date.now(),
        extend,
        skipOfferingId,
      });
    },
  };
}

/** In-memory L1 grantor for synthetic tests. Never assigns intern role. */
export function createMockL1Grantor() {
  /** @type {object[]} */
  const grants = [];
  return {
    grants,
    level: 'L1',
    async hasExisting(userId, offeringId, programRoute) {
      return grants.some(
        (row) =>
          String(row.userId) === String(userId) &&
          String(row.offeringId) === String(offeringId) &&
          (!programRoute || String(row.programRoute) === String(programRoute)),
      );
    },
    async grant({ userId, row }) {
      if (String(row.level).toUpperCase() !== 'L1') {
        throw new Error('L1 grantor cannot grant a non-L1 row.');
      }
      const offerings = offeringsFromInventoryRow(row);
      let last = null;
      for (const offering of offerings) {
        const record = {
          userId,
          offeringId: offering.offeringId,
          level: 'L1',
          programRoute: offering.programRoute || row.program_route,
          versaLeadRef: row.versa_lead_ref,
          role: null,
        };
        grants.push(record);
        last = record;
      }
      return last;
    },
  };
}

/**
 * In-memory L2 grantor. Payment proof is an imported `pro` row (Nilo Nov 12)
 * or `paymentVerified` from the authorized provider — never the HTTP body.
 */
export function createMockL2Grantor({ paymentVerified = false } = {}) {
  /** @type {object[]} */
  const grants = [];
  return {
    grants,
    level: 'L2',
    paymentVerified: Boolean(paymentVerified),
    async hasExisting(userId, offeringId, programRoute) {
      return grants.some(
        (row) =>
          String(row.userId) === String(userId) &&
          String(row.offeringId) === String(offeringId) &&
          (!programRoute || String(row.programRoute) === String(programRoute)) &&
          entitlementAllowsAccess(row, { now: Date.now(), graceDays: versaProGraceDays() }),
      );
    },
    async grant({ userId, row, paymentVerified: paid, env, now, extend = true }) {
      if (String(row.level).toUpperCase() !== 'L2') {
        throw new Error('L2 grantor cannot grant a non-L2 row.');
      }
      if (paid !== true && this.paymentVerified !== true) {
        throw new Error('L2 grant requires an imported pro row or authorized paymentVerified.');
      }
      const offerings = offeringsFromInventoryRow(row);
      let last = null;
      for (const offering of offerings) {
        const current = grants.find(
          (item) =>
            String(item.userId) === String(userId) && String(item.offeringId) === String(offering.offeringId),
        );
        const periodDays = versaProPeriodDays(env);
        const nowMs = now ?? Date.now();
        const redeemedMs = row.redeemed_at ? new Date(row.redeemed_at).getTime() : nowMs;
        const expiresAt = offering.termLimited
          ? extend !== false
            ? stackedExpiryIso(current?.expires_at, nowMs, periodDays)
            : current?.expires_at || stackedExpiryIso(null, Number.isFinite(redeemedMs) ? redeemedMs : nowMs, periodDays)
          : current?.expires_at ?? null;
        const record = {
          userId,
          offeringId: offering.offeringId,
          level: 'L2',
          programRoute: offering.programRoute || row.program_route,
          versaLeadRef: row.versa_lead_ref,
          expires_at: expiresAt,
          role: null,
        };
        if (current) Object.assign(current, record);
        else grants.push(record);
        last = current || record;
      }
      return last;
    },
  };
}

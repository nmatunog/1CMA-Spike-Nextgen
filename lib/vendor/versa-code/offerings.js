import { DEFAULT_L1_OFFERING_ID, DEFAULT_L2_OFFERING_ID, PROGRAM_ROUTES } from './constants.js';
import { normalizeLevel } from './entitlement.js';

/**
 * Offering catalog — the portable policy layer.
 * Free L1 Financial Literacy and free FEP need no code.
 * Paid L2 requires a Versa `pro` code. An imported `pro` row is payment
 * proof (Nilo, Nov 12) unless VERSA_PRO_CODE_IMPLIES_PAID is explicitly off.
 * Future offering-specific codes register here (`requiresCode: true`) without
 * changing verify/redeem control flow.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   level: string,
 *   access: 'free' | 'paid' | 'coded',
 *   requiresCode: boolean,
 *   paymentRequired: boolean,
 *   courses: string[],
 * }} OfferingPolicy
 */

/** @type {Record<string, OfferingPolicy>} */
const catalog = {
  [DEFAULT_L1_OFFERING_ID]: {
    id: DEFAULT_L1_OFFERING_ID,
    label: 'Financial Literacy',
    level: 'L1',
    access: 'free',
    requiresCode: false,
    paymentRequired: false,
    courses: [...PROGRAM_ROUTES],
  },
  fep: {
    id: 'fep',
    label: 'FEP',
    level: 'L1',
    access: 'free',
    requiresCode: false,
    paymentRequired: false,
    courses: [...PROGRAM_ROUTES],
  },
  [DEFAULT_L2_OFFERING_ID]: {
    id: DEFAULT_L2_OFFERING_ID,
    label: 'Financial Entrepreneurship',
    level: 'L2',
    access: 'paid',
    requiresCode: true,
    paymentRequired: true,
    courses: [...PROGRAM_ROUTES],
  },
};

/** Hosts / tests can register a future offering without forking verify(). */
export function registerOffering(policy) {
  if (!policy?.id) throw new Error('registerOffering requires policy.id');
  catalog[String(policy.id)] = {
    id: String(policy.id),
    label: policy.label || String(policy.id),
    level: normalizeLevel(policy.level),
    access: policy.access || (policy.paymentRequired ? 'paid' : 'coded'),
    requiresCode: policy.requiresCode !== false,
    paymentRequired: policy.paymentRequired === true,
    courses: Array.isArray(policy.courses) && policy.courses.length ? policy.courses : [...PROGRAM_ROUTES],
  };
  return catalog[String(policy.id)];
}

export function getOfferingPolicy(offeringId) {
  if (!offeringId) return null;
  return catalog[String(offeringId)] || null;
}

/**
 * Unknown future offerings fail closed: a code is required.
 * Known free L1 / FEP do not.
 */
export function resolveOfferingPolicy(offeringId, level) {
  const known = getOfferingPolicy(offeringId);
  if (known) return known;
  const lvl = normalizeLevel(level);
  if (lvl === 'L2') {
    return {
      id: offeringId || DEFAULT_L2_OFFERING_ID,
      label: offeringId || 'L2',
      level: 'L2',
      access: 'paid',
      requiresCode: true,
      paymentRequired: true,
      courses: [...PROGRAM_ROUTES],
    };
  }
  if (offeringId) {
    return {
      id: offeringId,
      label: offeringId,
      level: lvl,
      access: 'coded',
      requiresCode: true,
      paymentRequired: lvl !== 'L1',
      courses: [...PROGRAM_ROUTES],
    };
  }
  return getOfferingPolicy(DEFAULT_L1_OFFERING_ID);
}

/**
 * Map verify(code, identity, intendedCourse, intendedLevel) arguments
 * onto inventory fields. `intendedCourse` may be a program_route
 * (`spike-interns` | `ra-spike`) or an offering id (`financial-literacy` | `fep`).
 */
export function resolveIntended(intendedCourse, intendedLevel, extra = {}) {
  const course = String(intendedCourse || extra.programRoute || '').trim().toLowerCase();
  const level = normalizeLevel(intendedLevel || extra.level);
  const offeringHint = String(extra.offeringId || '').trim().toLowerCase();

  if (course === 'spike-interns' || course === 'ra-spike') {
    const offeringId = offeringHint || (level === 'L2' ? DEFAULT_L2_OFFERING_ID : DEFAULT_L1_OFFERING_ID);
    return { programRoute: course, level, offeringId };
  }

  const asOffering = getOfferingPolicy(course) || getOfferingPolicy(offeringHint);
  if (asOffering) {
    const programRoute = extra.programRoute || undefined;
    return {
      programRoute,
      level: intendedLevel ? normalizeLevel(intendedLevel) : asOffering.level,
      offeringId: asOffering.id,
    };
  }

  return {
    programRoute: extra.programRoute || undefined,
    level,
    offeringId: offeringHint || (level === 'L2' ? DEFAULT_L2_OFFERING_ID : DEFAULT_L1_OFFERING_ID),
  };
}

export function offeringRequiresCode(offeringId, level) {
  return resolveOfferingPolicy(offeringId, level).requiresCode !== false;
}

export { catalog as OFFERING_CATALOG };

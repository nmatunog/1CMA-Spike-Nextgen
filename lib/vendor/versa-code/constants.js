/** Disabled-by-default SPIKE–Versa CSV code gate (SPIKE #7 Checkpoint 01). */

export const VERSA_FLAG_ENV = 'VERSA_CSV_CODE_GATE';
export const VERSA_HMAC_SECRET_ENV = 'VERSA_CODE_HMAC_SECRET';
export const VERSA_L1_OFFERING_ENV = 'VERSA_L1_OFFERING_ID';
/** Nilo (Nov 12, 2026): Versa collects payment, so an imported `pro` row is paid. Default on. */
export const VERSA_PRO_CODE_IMPLIES_PAID_ENV = 'VERSA_PRO_CODE_IMPLIES_PAID';
/** Option B (Nilo / Versa, Nov 12 1:57 PM): days added per new PRO code. Default 30. Never from CSV/body. */
export const VERSA_PRO_PERIOD_DAYS_ENV = 'VERSA_PRO_PERIOD_DAYS';
/** D-series grace after L2 expiry. Default 7. Lazy access check; no cron. */
export const VERSA_PRO_GRACE_DAYS_ENV = 'VERSA_PRO_GRACE_DAYS';
/** Test-only: allow the JS consume fallback when the atomic RPC is missing. Production stays 503. */
export const VERSA_ALLOW_JS_CONSUME_FALLBACK_ENV = 'VERSA_ALLOW_JS_CONSUME_FALLBACK';

export const GENERIC_DENY_MESSAGE =
  "We couldn't verify this code for your account. Check the code or use the enrollment help link.";

/** Neutral placeholder — Versa delivery channel is an open external dependency. */
export const VERSA_HELP_PLACEHOLDER =
  'Access codes are issued through the SPIKE–Versa enrollment process. Delivery channel is pending the co-branded enrollment page.';

/** Known catalog. L3+ each need their own PlanSlug later — PRO is L2 only. */
export const LEVELS = Object.freeze(['L1', 'L2', 'L3']);
export const STATUSES = Object.freeze(['available', 'redeemed', 'revoked', 'expired']);
export const PROGRAM_ROUTES = Object.freeze(['spike-interns', 'ra-spike']);

export const DEFAULT_L1_OFFERING_ID = 'financial-literacy';
export const DEFAULT_L2_OFFERING_ID = 'financial-entrepreneurship';

export const REASONS = Object.freeze({
  valid: 'valid',
  unknown: 'unknown',
  wrong_identity: 'wrong_identity',
  wrong_offering: 'wrong_offering',
  reused: 'reused',
  revoked: 'revoked',
  expired: 'expired',
  rate_limited: 'rate_limited',
  gate_unsatisfied: 'gate_unsatisfied',
  already_granted: 'already_granted',
  flag_off: 'flag_off',
  missing_secret: 'missing_secret',
  missing_identity_link: 'missing_identity_link',
  invalid_row: 'invalid_row',
  wrong_program_route: 'wrong_program_route',
  unverified_identity: 'unverified_identity',
  code_not_required: 'code_not_required',
  unavailable: 'unavailable',
});

/** Locked Versa export header (UTF-8 BOM on the first file is stripped). */
export const VERSA_EXPORT_HEADER =
  'Code,Plan,PlanSlug,Owner,SiteName,Inventory,Status,PurchasedAt,DurationDays,UnitPriceTokens,CreatedAt';

export const VERSA_CSV_COLUMNS = Object.freeze({
  code: 'Code',
  plan: 'Plan',
  planSlug: 'PlanSlug',
  owner: 'Owner',
  siteName: 'SiteName',
  inventory: 'Inventory',
  status: 'Status',
  purchasedAt: 'PurchasedAt',
  durationDays: 'DurationDays',
  unitPriceTokens: 'UnitPriceTokens',
  createdAt: 'CreatedAt',
});

/** @deprecated use VERSA_CSV_COLUMNS — kept so older overlays still resolve. */
export const ASSUMED_CSV_COLUMNS = VERSA_CSV_COLUMNS;

export const HEADER_ALIASES = Object.freeze({
  code: ['code'],
  plan: ['plan'],
  planSlug: ['planslug', 'plan_slug'],
  owner: ['owner'],
  siteName: ['sitename', 'site_name'],
  inventory: ['inventory'],
  status: ['status'],
  purchasedAt: ['purchasedat', 'purchased_at'],
  durationDays: ['durationdays', 'duration_days'],
  unitPriceTokens: ['unitpricetokens', 'unit_price_tokens'],
  createdAt: ['createdat', 'created_at'],
});

export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MAX_FAILURES = 8;

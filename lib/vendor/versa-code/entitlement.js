import {
  VERSA_PRO_GRACE_DAYS_ENV,
  VERSA_PRO_PERIOD_DAYS_ENV,
} from './constants.js';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_PRO_PERIOD_DAYS = 30;
export const DEFAULT_PRO_GRACE_DAYS = 7;

/** @param {unknown} value */
export function normalizeLevel(value, fallback = 'L1') {
  const raw = String(value || '').trim().toUpperCase();
  if (/^L[1-9]\d*$/.test(raw)) return raw;
  return fallback;
}

/** @param {unknown} level */
export function levelRank(level) {
  const n = Number(String(normalizeLevel(level)).slice(1));
  return Number.isFinite(n) ? n : 1;
}

/**
 * @param {Record<string, string | undefined> | null | undefined} env
 * @param {string} key
 * @param {number} fallback
 */
export function envDayCount(env, key, fallback) {
  const raw = String(env?.[key] ?? '').trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** @param {Record<string, string | undefined> | null | undefined} env */
export function versaProPeriodDays(env) {
  return envDayCount(env, VERSA_PRO_PERIOD_DAYS_ENV, DEFAULT_PRO_PERIOD_DAYS);
}

/** @param {Record<string, string | undefined> | null | undefined} env */
export function versaProGraceDays(env) {
  return envDayCount(env, VERSA_PRO_GRACE_DAYS_ENV, DEFAULT_PRO_GRACE_DAYS);
}

/**
 * Option B (Nilo / Versa, Nov 12 1:57 PM): new_expiry = max(now, current) + period.
 * Never from CSV DurationDays or the HTTP body.
 * @param {string | null | undefined} currentExpiresAt
 * @param {number} nowMs
 * @param {number} periodDays
 */
export function stackedExpiryIso(currentExpiresAt, nowMs, periodDays) {
  const currentMs = currentExpiresAt ? new Date(currentExpiresAt).getTime() : NaN;
  const base = Number.isFinite(currentMs) ? Math.max(nowMs, currentMs) : nowMs;
  const days = Number.isFinite(periodDays) && periodDays >= 0 ? periodDays : DEFAULT_PRO_PERIOD_DAYS;
  return new Date(base + days * MS_PER_DAY).toISOString();
}

/**
 * Lazy access (no cron). null expires_at = non-expiring (FREE).
 * @param {{ expires_at?: string | null } | null | undefined} row
 * @param {{ now?: number, graceDays?: number }} [opts]
 * @returns {'active' | 'grace' | 'denied'}
 */
export function entitlementAccessState(row, opts = {}) {
  if (!row) return 'denied';
  if (!row.expires_at) return 'active';
  const now = opts.now ?? Date.now();
  const graceDays = opts.graceDays ?? DEFAULT_PRO_GRACE_DAYS;
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(exp)) return 'denied';
  if (now <= exp) return 'active';
  if (now <= exp + graceDays * MS_PER_DAY) return 'grace';
  return 'denied';
}

export function entitlementAllowsAccess(row, opts = {}) {
  const state = entitlementAccessState(row, opts);
  return state === 'active' || state === 'grace';
}

/**
 * A PRO L2 entitlement never satisfies L3. Levels match by slug map, not a paid flag.
 * @param {{ level?: string, offering_id?: string, expires_at?: string | null } | null | undefined} row
 * @param {{ level?: string, offeringId?: string, now?: number, graceDays?: number }} [want]
 */
export function entitlementCovers(row, want = {}) {
  if (!entitlementAllowsAccess(row, want)) return false;
  if (want.level && normalizeLevel(row?.level) !== normalizeLevel(want.level)) return false;
  if (want.offeringId && String(row?.offering_id || '') !== String(want.offeringId)) return false;
  return true;
}

/**
 * No scheduled job is wired. Access is lazy at gate time. If a job calls this,
 * it must not revoke Versa PRO (or FREE) rows — post-grace deny is a read check.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function lapseExpiredVersaEntitlements(admin) {
  const { data, error } = await admin
    .from('versa_entitlements')
    .select('id, offering_id, expires_at');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { ok: true, lapsed: 0, skipped: rows.length, checked: rows.length };
}

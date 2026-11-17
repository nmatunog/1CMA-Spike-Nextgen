/**
 * Inventory helpers against versa_code_inventory (service-role client).
 * Tests inject an in-memory admin with the same chainable surface.
 * Portable grant = versa_entitlements. No intern role / intern_progress.
 */

import {
  REASONS,
  VERSA_ALLOW_JS_CONSUME_FALLBACK_ENV,
} from './constants.js';
import {
  stackedExpiryIso,
  versaProPeriodDays,
} from './entitlement.js';
import { importedProRowImpliesPaid, offeringsFromInventoryRow } from './planSlug.js';

function jsConsumeFallbackAllowed(env) {
  const raw = String(env?.[VERSA_ALLOW_JS_CONSUME_FALLBACK_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/** Fallback consume must return plan_slug so a free row grants Literacy + FEP. */
const CONSUME_ROW_COLUMNS =
  'id, versa_lead_ref, verified_email, verified_user_id, level, offering_id, status, program_route, redeemed_by, redeemed_at, plan, plan_slug';

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function findInventoryByDigest(admin, digest) {
  const { data, error } = await admin
    .from('versa_code_inventory')
    .select(
      'id, versa_lead_ref, verified_email, verified_user_id, level, offering_id, status, expires_at, payment_confirmation_ref, program_route, redeemed_by, redeemed_at, batch_id, external_code_id, plan, plan_slug',
    )
    .eq('code_digest', digest)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Atomic consume + portable entitlement grant. Destination grantor runs in the
 * same JS fallback transaction (rollback consume if grant throws).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function consumeAndGrant(admin, {
  id,
  userId,
  grantor = null,
  env = {},
  now = Date.now(),
}) {
  const { data, error } = await admin.rpc('redeem_versa_code_and_grant', {
    p_id: id,
    p_user_id: userId,
    p_period_days: versaProPeriodDays(env),
    p_now: new Date(now).toISOString(),
  });
  if (!error) {
    const result = data ?? { ok: false, reason: 'reused' };
    if (result.ok && grantor) {
      await grantor.grant({
        userId,
        row: result.row,
        paymentVerified: importedProRowImpliesPaid(result.row, env),
        env,
        now,
        extend: result.already_granted !== true,
        skipOfferingId: result.row?.offering_id,
      });
    }
    return result;
  }

  const missingRpc =
    error.code === 'PGRST202' ||
    /could not find the function|schema cache|does not exist/i.test(error.message || '');
  if (!missingRpc) throw new Error(error.message);

  if (!jsConsumeFallbackAllowed(env)) {
    return { ok: false, reason: REASONS.unavailable };
  }

  return consumeAndGrantFallback(admin, { id, userId, grantor, env, now });
}

async function consumeAndGrantFallback(admin, { id, userId, grantor, env, now }) {
  const { data: existing } = await admin
    .from('versa_code_inventory')
    .select(CONSUME_ROW_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (existing?.status === 'redeemed') {
    if (String(existing.plan_slug || '').toLowerCase() === 'pro') {
      return { ok: false, reason: 'reused' };
    }
    if (String(existing.redeemed_by) === String(userId)) {
      if (grantor) {
        await grantor.grant({
          userId,
          row: existing,
          paymentVerified: importedProRowImpliesPaid(existing, env),
          env,
          now,
          extend: false,
        });
      } else {
        await grantOfferingsFromRow(admin, {
          userId,
          row: existing,
          env,
          now,
          extend: false,
        });
      }
      const entitlement = await findEntitlement(admin, userId, existing.offering_id);
      return { ok: true, already_granted: true, row: existing, entitlement };
    }
  }

  const { data: updated, error: updErr } = await admin
    .from('versa_code_inventory')
    .update({
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
      redeemed_by: userId,
      verified_user_id: existing?.verified_user_id || userId,
    })
    .eq('id', id)
    .eq('status', 'available')
    .select(CONSUME_ROW_COLUMNS)
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!updated) return { ok: false, reason: 'reused' };

  try {
    let entitlement = null;
    if (grantor) {
      entitlement = await grantor.grant({
        userId,
        row: updated,
        paymentVerified: importedProRowImpliesPaid(updated, env),
        env,
        now,
        extend: true,
      });
    }
    entitlement = entitlement || await grantOfferingsFromRow(admin, {
      userId,
      row: updated,
      env,
      now,
      extend: true,
    });
    return { ok: true, already_granted: false, row: updated, entitlement };
  } catch (grantErr) {
    await admin
      .from('versa_code_inventory')
      .update({
        status: 'available',
        redeemed_at: null,
        redeemed_by: null,
        verified_user_id: existing?.verified_user_id ?? null,
      })
      .eq('id', id)
      .eq('redeemed_by', userId);
    throw grantErr;
  }
}

/** @deprecated use consumeAndGrant */
export async function consumeInventoryRow(admin, { id, userId }) {
  const result = await consumeAndGrant(admin, { id, userId });
  return result?.ok ? result.row : null;
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function insertInventoryRow(admin, row) {
  const { data, error } = await admin
    .from('versa_code_inventory')
    .insert(row)
    .select('id, versa_lead_ref, level, offering_id, status')
    .maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return { duplicate: true, error };
    }
    throw new Error(error.message);
  }
  return { duplicate: false, data };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function recordAttempt(admin, row) {
  const { error } = await admin.from('versa_code_attempts').insert({
    actor_user_id: row.actorUserId ?? null,
    inventory_id: row.inventoryId ?? null,
    reason: row.reason,
    offering_id: row.offeringId ?? null,
    level: row.level ?? null,
    program_route: row.programRoute ?? null,
  });
  if (error && !/schema cache|does not exist|42P01/i.test(error.message || '')) {
    throw new Error(error.message);
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function findEntitlement(admin, userId, offeringId) {
  const { data, error } = await admin
    .from('versa_entitlements')
    .select('id, user_id, offering_id, level, versa_lead_ref, program_route, granted_at, expires_at, inventory_id')
    .eq('user_id', userId)
    .eq('offering_id', offeringId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Write portable entitlements. Term-limited (PRO) rows stack
 * max(now, current_expiry) + period when extend is true.
 */
export async function grantOfferingsFromRow(admin, {
  userId,
  row,
  env = {},
  now = Date.now(),
  extend = true,
  skipOfferingId = null,
}) {
  const offerings = offeringsFromInventoryRow(row);
  let last = null;
  for (const offering of offerings) {
    if (skipOfferingId && offering.offeringId === skipOfferingId) continue;
    last = await upsertEntitlement(admin, {
      userId,
      inventoryId: row.id,
      versaLeadRef: row.versa_lead_ref,
      level: offering.level || row.level,
      offeringId: offering.offeringId,
      programRoute: offering.programRoute || row.program_route,
      env,
      now,
      extend,
      termLimited: offering.termLimited === true,
      redeemedAt: row.redeemed_at,
    });
  }
  return last;
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function upsertEntitlement(admin, row) {
  const existing = await findEntitlement(admin, row.userId, row.offeringId);
  let expiresAt = null;
  if (row.termLimited) {
    const periodDays = versaProPeriodDays(row.env);
    const nowMs = row.now ?? Date.now();
    if (row.extend === false) {
      const redeemedMs = row.redeemedAt ? new Date(row.redeemedAt).getTime() : nowMs;
      const derived = stackedExpiryIso(null, Number.isFinite(redeemedMs) ? redeemedMs : nowMs, periodDays);
      expiresAt = existing?.expires_at || derived;
    } else {
      expiresAt = stackedExpiryIso(existing?.expires_at, nowMs, periodDays);
    }
  }

  const { data, error } = await admin
    .from('versa_entitlements')
    .upsert(
      {
        user_id: row.userId,
        inventory_id: row.inventoryId,
        versa_lead_ref: row.versaLeadRef,
        level: row.level,
        offering_id: row.offeringId,
        program_route: row.programRoute,
        granted_at: row.grantedAt ?? new Date(row.now ?? Date.now()).toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'user_id,offering_id' },
    )
    .select('id, user_id, offering_id, level, versa_lead_ref, program_route, granted_at, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function listEntitlementsForUser(admin, userId) {
  const { data, error } = await admin
    .from('versa_entitlements')
    .select('offering_id, level, versa_lead_ref, program_route, granted_at, expires_at')
    .eq('user_id', userId)
    .order('granted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

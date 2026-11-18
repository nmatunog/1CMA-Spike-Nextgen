/**
 * In-memory Supabase-shaped admin used by Checkpoint 01 tests.
 * Serializes inventory consume so concurrent redeem can prove single-use.
 */

import { stackedExpiryIso } from '../entitlement.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function matchesFilters(row, filters) {
  return filters.every(({ col, val }) => String(row[col]) === String(val));
}

function upsertEntitlementRow(tables, nextId, row) {
  const existing = tables.versa_entitlements.find(
    (item) =>
      String(item.user_id) === String(row.user_id) &&
      String(item.offering_id) === String(row.offering_id) &&
      String(item.program_route || '') === String(row.program_route || ''),
  );
  if (existing) {
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) existing[key] = value;
    }
    return clone(existing);
  }
  const inserted = { ...row };
  if (inserted.id == null) {
    inserted.id = nextId.versa_entitlements ?? tables.versa_entitlements.length + 1;
    nextId.versa_entitlements = inserted.id + 1;
  }
  tables.versa_entitlements.push(inserted);
  return clone(inserted);
}


export function createMemoryAdmin(seed = {}) {
  const tables = {
    versa_code_inventory: [...(seed.versa_code_inventory || [])],
    versa_entitlements: [...(seed.versa_entitlements || [])],
    versa_code_attempts: [...(seed.versa_code_attempts || [])],
    versa_rate_limits: [...(seed.versa_rate_limits || [])],
    intern_progress: [...(seed.intern_progress || [])],
    profiles: [...(seed.profiles || [])],
    activation_codes: [...(seed.activation_codes || [])],
  };
  let nextId = {
    versa_code_inventory: tables.versa_code_inventory.length + 1,
    versa_entitlements: tables.versa_entitlements.length + 1,
    versa_code_attempts: tables.versa_code_attempts.length + 1,
    intern_progress: tables.intern_progress.length + 1,
    profiles: tables.profiles.length + 1,
  };
  let consumeChain = Promise.resolve();

  function serialize(fn) {
    const run = consumeChain.then(fn, fn);
    consumeChain = run.catch(() => {});
    return run;
  }

  function from(table) {
    if (seed.missingRateLimits && table === 'versa_rate_limits') {
      const err = { data: null, error: { code: '42P01', message: 'relation versa_rate_limits does not exist' } };
      const missing = {
        select() { return missing; },
        eq() { return missing; },
        upsert() { return missing; },
        update() { return missing; },
        maybeSingle: async () => err,
        then: (resolve, reject) => Promise.resolve(err).then(resolve, reject),
      };
      return missing;
    }
    if (!tables[table]) tables[table] = [];
    /** @type {{ filters: {col:string,val:unknown}[], patch: object | null, insertRows: object[] | null, columns: string | null, op: string }} */
    const state = {
      filters: [],
      patch: null,
      insertRows: null,
      columns: '*',
      op: 'select',
      upsert: false,
      onConflict: null,
    };

    const builder = {
      select(columns = '*') {
        state.columns = columns;
        if (!state.op || state.op === 'select') state.op = state.patch ? 'update' : state.insertRows ? 'insert' : 'select';
        return builder;
      },
      insert(row) {
        state.op = 'insert';
        state.insertRows = Array.isArray(row) ? row : [row];
        return builder;
      },
      upsert(row, opts = {}) {
        state.op = 'upsert';
        state.upsert = true;
        state.onConflict = opts.onConflict || null;
        state.insertRows = Array.isArray(row) ? row : [row];
        return builder;
      },
      update(patch) {
        state.op = 'update';
        state.patch = patch;
        return builder;
      },
      eq(col, val) {
        state.filters.push({ col, val });
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        return execute(true);
      },
      then(resolve, reject) {
        return execute(false).then(resolve, reject);
      },
    };

    async function execute(single) {
      const run = async () => {
        if (state.op === 'insert' || state.op === 'upsert') {
          const inserted = [];
          for (const raw of state.insertRows || []) {
            const row = { ...raw };
            if (table === 'versa_code_inventory') {
              const dup = tables[table].some(
                (existing) => existing.code_digest && existing.code_digest === row.code_digest,
              );
              if (dup) {
                return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
              }
            }
            if (state.op === 'upsert' && state.onConflict) {
              const keys = String(state.onConflict).split(',').map((k) => k.trim());
              const existing = tables[table].find((item) => keys.every((k) => String(item[k]) === String(row[k])));
              if (existing) {
                for (const [key, value] of Object.entries(row)) {
                  if (value !== undefined) existing[key] = value;
                }
                inserted.push(clone(existing));
                continue;
              }
            }
            if (row.id == null) {
              row.id = nextId[table] ?? tables[table].length + 1;
              nextId[table] = row.id + 1;
            }
            tables[table].push(row);
            inserted.push(clone(row));
          }
          const data = single ? inserted[0] ?? null : inserted;
          return { data, error: null };
        }

        if (state.op === 'update') {
          const matched = tables[table].filter((row) => matchesFilters(row, state.filters));
          for (const row of matched) {
            Object.assign(row, state.patch);
          }
          const data = single ? clone(matched[0] ?? null) : clone(matched);
          return { data, error: null };
        }

        const matched = tables[table].filter((row) => matchesFilters(row, state.filters));
        const data = single ? clone(matched[0] ?? null) : clone(matched);
        return { data, error: null };
      };

      if (table === 'versa_code_inventory' && state.op === 'update') {
        return serialize(run);
      }
      return run();
    }

    return builder;
  }

  async function rpc(name, args) {
    if (name === 'versa_rate_limit_record_fail') {
      if (seed.missingRateLimits) {
        return { data: null, error: { code: '42P01', message: 'relation versa_rate_limits does not exist' } };
      }
      if (seed.missingRateLimitRpc) {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.versa_rate_limit_record_fail',
          },
        };
      }
      const key = args.p_rate_key;
      const windowMs = Number(args.p_window_ms) || 600000;
      const now = Date.now();
      let row = tables.versa_rate_limits.find((item) => item.rate_key === key);
      if (!row) {
        row = { rate_key: key, fail_count: 1, window_start: new Date(now).toISOString() };
        tables.versa_rate_limits.push(row);
        return { data: 1, error: null };
      }
      const start = new Date(row.window_start).getTime();
      if (!Number.isFinite(start) || now - start > windowMs) {
        row.fail_count = 1;
        row.window_start = new Date(now).toISOString();
      } else {
        row.fail_count = Number(row.fail_count) + 1;
      }
      return { data: row.fail_count, error: null };
    }

    if (name === 'redeem_versa_code_and_grant') {
      if (seed.missingRedeemRpc) {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.redeem_versa_code_and_grant',
          },
        };
      }
      return serialize(async () => {
        const row = tables.versa_code_inventory.find((item) => item.id === args.p_id);
        if (!row) return { data: { ok: false, reason: 'unknown' }, error: null };

        if (row.status === 'redeemed') {
          if (String(row.plan_slug || '').toLowerCase() === 'pro') {
            return { data: { ok: false, reason: 'reused' }, error: null };
          }
          if (String(row.redeemed_by) === String(args.p_user_id)) {
            const existingEnt = tables.versa_entitlements.find(
              (item) =>
                String(item.user_id) === String(args.p_user_id) &&
                String(item.offering_id) === String(row.offering_id),
            );
            const entitlement = upsertEntitlementRow(tables, nextId, {
              user_id: args.p_user_id,
              inventory_id: row.id,
              versa_lead_ref: row.versa_lead_ref,
              level: row.level,
              offering_id: row.offering_id,
              program_route: row.program_route,
              expires_at: existingEnt?.expires_at ?? null,
            });
            return { data: { ok: true, already_granted: true, row: clone(row), entitlement }, error: null };
          }
        }

        if (row.status !== 'available') {
          return { data: { ok: false, reason: 'reused' }, error: null };
        }

        const nowIso = args.p_now || new Date().toISOString();
        const nowMs = new Date(nowIso).getTime();
        const periodDays = Number.parseInt(String(args.p_period_days ?? 30), 10);
        row.status = 'redeemed';
        row.redeemed_at = nowIso;
        row.redeemed_by = args.p_user_id;
        row.verified_user_id = row.verified_user_id || args.p_user_id;
        const existingEnt = tables.versa_entitlements.find(
          (item) =>
            String(item.user_id) === String(args.p_user_id) &&
            String(item.offering_id) === String(row.offering_id),
        );
        const termLimited = String(row.plan_slug || '').toLowerCase() === 'pro';
        const entitlement = upsertEntitlementRow(tables, nextId, {
          user_id: args.p_user_id,
          inventory_id: row.id,
          versa_lead_ref: row.versa_lead_ref,
          level: row.level,
          offering_id: row.offering_id,
          program_route: row.program_route,
          granted_at: nowIso,
          expires_at: termLimited
            ? stackedExpiryIso(existingEnt?.expires_at, nowMs, Number.isFinite(periodDays) ? periodDays : 30)
            : existingEnt?.expires_at ?? null,
        });
        return { data: { ok: true, already_granted: false, row: clone(row), entitlement }, error: null };
      });
    }

    if (name !== 'redeem_versa_code_row') {
      return { data: null, error: { message: `unknown rpc ${name}`, code: 'PGRST202' } };
    }
    return serialize(async () => {
      const row = tables.versa_code_inventory.find(
        (item) => item.id === args.p_id && item.status === 'available',
      );
      if (!row) return { data: null, error: null };
      row.status = 'redeemed';
      row.redeemed_at = new Date().toISOString();
      row.redeemed_by = args.p_user_id;
      return { data: clone(row), error: null };
    });
  }

  return {
    from,
    rpc,
    tables,
    auth: {
      getUser: async () => ({ data: { user: seed.authUser || null }, error: null }),
      admin: {
        createUser: async ({ email, email_confirm }) => {
          const user = {
            id: seed.nextUserId || 'user-created-1',
            email,
            email_confirmed_at: email_confirm ? new Date().toISOString() : null,
          };
          return { data: { user }, error: null };
        },
      },
    },
  };
}

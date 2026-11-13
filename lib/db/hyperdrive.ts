import postgres from "postgres";
import { after } from "next/server";
import { HYPERDRIVE_POSTGRES_OPTIONS } from "./postgres-options";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type SqlClient = ReturnType<typeof postgres>;

export type CloudflareContextSlot = {
  env?: {
    HYPERDRIVE?: { connectionString?: string };
  };
  ctx?: {
    waitUntil?: (promise: Promise<unknown>) => void;
  };
};

const clients = new WeakMap<object, SqlClient>();

function cloudflareStore(): CloudflareContextSlot | undefined {
  return (globalThis as unknown as Record<symbol, CloudflareContextSlot | undefined>)[CLOUDFLARE_CONTEXT];
}

/**
 * OpenNext stores the current Worker request context on globalThis under this
 * symbol (ALS). Missing in Node/tests, so local DATABASE_URL / PGlite is unchanged.
 */
export function workersHyperdriveConnectionString(): string | null {
  const url = cloudflareStore()?.env?.HYPERDRIVE?.connectionString;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function scheduleClientEnd(store: CloudflareContextSlot, client: SqlClient) {
  const waitUntil = store.ctx?.waitUntil?.bind(store.ctx);
  const close = () => client.end({ timeout: 5 });
  const runAfterResponse = () => {
    const pending = close();
    waitUntil?.(pending);
    return pending;
  };
  try {
    after(runAfterResponse);
  } catch {
    waitUntil?.(close());
  }
}

/**
 * One postgres.js client per OpenNext request context (WeakMap on the ALS store).
 * Closed after the response via Next `after()` + `ctx.waitUntil(client.end({ timeout: 5 }))`.
 */
export function workersPostgres(): SqlClient | null {
  const store = cloudflareStore();
  if (!store) return null;
  const url = store.env?.HYPERDRIVE?.connectionString;
  if (typeof url !== "string" || !url.trim()) return null;
  const cached = clients.get(store);
  if (cached) return cached;
  const client = postgres(url.trim(), HYPERDRIVE_POSTGRES_OPTIONS);
  clients.set(store, client);
  scheduleClientEnd(store, client);
  return client;
}

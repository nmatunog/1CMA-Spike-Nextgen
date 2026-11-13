const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type CloudflareContextSlot = {
  env?: {
    HYPERDRIVE?: { connectionString?: string };
  };
};

/**
 * OpenNext stores the current Worker request context on globalThis under this
 * symbol. Missing in Node/tests, so local DATABASE_URL / PGlite is unchanged.
 */
export function workersHyperdriveConnectionString(): string | null {
  const ctx = (globalThis as unknown as Record<symbol, CloudflareContextSlot | undefined>)[CLOUDFLARE_CONTEXT];
  const url = ctx?.env?.HYPERDRIVE?.connectionString;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** Node / local / tests: postgres.js against DATABASE_URL (often a pooler). */
export const NODE_POSTGRES_OPTIONS = { max: 1, prepare: false as const };

/**
 * Cloudflare Workers + Hyperdrive: request-scoped client.
 * Do not set `prepare: false` — Hyperdrive caches prepared statements.
 * `max: 5` matches the Workers concurrent-connection limit in Cloudflare's postgres.js example.
 */
export const HYPERDRIVE_POSTGRES_OPTIONS = { max: 5 };

export type PostgresMode = "node" | "hyperdrive";

export function postgresOptions(mode: PostgresMode) {
  return mode === "hyperdrive" ? HYPERDRIVE_POSTGRES_OPTIONS : NODE_POSTGRES_OPTIONS;
}

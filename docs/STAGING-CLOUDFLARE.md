# Nextgen Cloudflare staging (code-only)

Clickable staging copy of Nextgen on Cloudflare Workers via OpenNext. This PR is **adapter code only**: it does not create Cloudflare, Hyperdrive, or database resources, does not deploy, and does not store secrets.

Worker name: `nextgen-staging`. No custom domain is configured. Migrations are **not** applied inside the Worker; use the off-platform script below.

GIA stays model-free. KP-SAFETY-01 text is unchanged.

## Login path

Staff sign in at `/login`, then open `/recruitment/command`.

## Worker / Wrangler variable **names**

Set values off-repo (Wrangler secrets or `.dev.vars`, which is gitignored). Do not commit values.

Required:

- `GIA_TRUSTED_PROXY` — production/staging edge is Cloudflare; set to `cloudflare`
- `GIA_PILOT_ENABLED` — `true`
- `GIA_PUBLIC_ORIGIN`
- `AUTH_SECRET`
- `GIA_SESSION_SECRET`
- `GIA_OTP_DEV` — must stay `false` (dev OTP is forbidden in production/staging)

Staff auth (hashes from `npm run staff:hash`; plaintext is never stored in git):

- `RECRUITMENT_STAFF_ACCOUNTS`
- `RECRUITMENT_STAFF_ROLES`

Optional / existing names (same meanings as local):

- `GIA_OTP_SECRET`
- `GIA_RATE_LIMIT_IP_MAX`
- `GIA_RATE_LIMIT_GLOBAL_MAX`
- `GIA_URGENT_UNCONSENTED_IP_MAX`
- `GIA_RATE_WINDOW_TTL_MS`
- `AUTH_URL`
- `NEXTAUTH_SECRET`

Postgres on Workers uses the Hyperdrive binding `HYPERDRIVE` (`env.HYPERDRIVE.connectionString`), not `DATABASE_URL`. `wrangler.jsonc` ships a **placeholder** Hyperdrive id. Replace that id off-repo before any real deploy.

Local Node and tests keep `DATABASE_URL` (and PGlite) unchanged.

## Off-platform migrate / seed

`scripts/staging-migrate-seed.mjs` runs on Node against `DATABASE_URL`. It refuses unless `STAGING_CONFIRM=nextgen-staging` **and** the URL host (or `host/dbname`) matches `STAGING_DATABASE_HOST`. It applies `migrations/0001`–`0011` in order, then `seedFutureFep` and `seedSyntheticQueue` (synthetic queue only).

Names:

- `STAGING_CONFIRM`
- `STAGING_DATABASE_HOST` (allowlist, comma-separated; e.g. `127.0.0.1` or `127.0.0.1/nextgen_staging`)
- `DATABASE_URL`
- `STAGING_LEADER_EMAIL` (optional; seed assignment)

Do not run `apply-migrations.mjs` in the Worker.

## Staff hashes

`npm run staff:hash` prints `RECRUITMENT_STAFF_ACCOUNTS` / `RECRUITMENT_STAFF_ROLES` (scrypt hashes only) and writes plaintext passwords only to `work/staff-plaintext.json` (gitignored).

## Scripts (do not deploy from this PR)

- `npm run build:cf` — `opennextjs-cloudflare build`
- `npm run preview` — build then Wrangler preview
- `npm run deploy` — present for the adapter; **do not run** until Nilo/SPIKEDEV approve a deploy
- `npm run staging:migrate-seed`
- `npm run staff:hash`

Local `next dev` / PGlite demo (`npm run demo:gia`) is unchanged. Wrangler Hyperdrive `localConnectionString` points at a **local real Postgres** (`postgres://postgres:postgres@127.0.0.1:5432/nextgen_staging`), not PGlite. PGlite remains for unit tests and `next` locally; Hyperdrive’s local proxy is not a PGlite protocol adapter. On Workers, `sql()` / `getDb()` / `rate.mjs` / `listSessions` share one memoized postgres.js client per request.

`app/icon.tsx` uses the Node runtime so OpenNext can bundle it (edge metadata routes are not split out). `esbuild` is pinned at 0.28.x so the OpenNext server bundle can resolve packages.

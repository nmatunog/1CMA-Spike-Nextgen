# Member storage hardening — draft, no hosted apply

Source: [SPIKEDEV brief 6968910665](https://github.com/nmatunog/NEXO/issues/32#issuecomment-6968910665),
following [Claude's residual findings](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/27#issuecomment-6965812698).
Base: `mvp01/staging-cf` at `e08e1e34b83a9e69f90975c49ad8021bb28a3a40`.
Nilo's staging redeploy HOLD remains. This draft changes no hosted database,
Access policy, mail provider, authoritative code service, or deployed Worker.

## Trust boundary

Request GUCs are useful row filters but an SQL principal can rebind them.
Migration 0013 therefore revokes the earlier unproved account/challenge function
signatures and requires a server-held HMAC-SHA256 proof for account creation,
activation and scope-free challenge discovery. Proofs bind the exact operation and
arguments, expire after 60 seconds (SQL accepts no more than 120 seconds ahead),
and carry a random one-use nonce. Consumption is transactional: rollback rolls
back nonce use; commit prevents replay. Proofs and SQL parameters must never be
returned to a browser or logged. The private key/nonce tables and authorization
helper are inaccessible to member roles; PUBLIC execution is revoked. Functions
are migration-owner SECURITY DEFINER with fixed `pg_catalog, public` search path
and explicit qualified tables. HMAC uses PostgreSQL core SHA-256 with no extension.

Creation/activation additionally require the immutable, verified, unexpired
handoff and matching verified candidate email. Pending creation cannot overwrite
an existing candidate account, and activation only changes that exact pending
account. Disabled/active accounts remain untouched. Handshake code checks confer
no course entitlement; the existing L1/L2 checks remain unchanged.

A proof would not help if raw SQL could forge a verified handoff or replace a
signed arrival ticket's stored payload. Handoff writes and ticket issue/consume
therefore also move behind proof-bearing fixed functions. Rotation copies the
stored payload, not caller-supplied replacement data. Member SQL cannot directly
write handoffs or read/write tickets. Browser issuer signing, ticket format,
nonce contract and URL remain unchanged.

LOW-3: handoff SELECT is bound to the handoff hash or email; pending signup
SELECT/INSERT/UPDATE/DELETE each require email or handoff scope. Missing scope
returns no rows. Scope is cleared and rebound transaction-locally on every request.
These GUC filters do not promise isolation against arbitrary rebinds to a known
email/hash; the proof boundary protects the privileged operations above.

## Dedicated login and fail-closed configuration

`member_runtime` is LOGIN, INHERIT, non-owner, NOSUPERUSER, NOCREATEDB,
NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, with only `member_app` membership.
The additive migration creates it with no password and no privileged membership.
Application member operations use a separate `MEMBER_DATABASE_URL`, never the
canonical owner connection. Every transaction checks session-user privileges,
exact membership, unsafe inherited member roles, and public/private object
ownership before `SET LOCAL ROLE member_app`. RESET ROLE returns to the restricted
login and cannot recover an owner identity.

Unset/invalid member URL or proof key returns storage-unconfigured; a wrong login
is rejected. Local runtime additionally requires the existing explicit demo flags,
loopback canonical/member databases at the same host/port/name, and loopback HTTP
origin. Hosted runtime remains disabled. `MEMBER_DB_PROOF_SECRET` must be 32 random
bytes represented as 64 lowercase hex digits. Migration 0013 intentionally leaves
`member_private.proof_keys` empty: functions return false/null with no key.
Provisioning the matching private DB key and server secret, credential management,
TLS and least-privilege login wiring are separately reviewed hosted holds, not
actions performed or authorized by this draft. The local harness supplies only
ephemeral synthetic secrets; no hosted defaults or credentials are committed.

## Reproduce on a throwaway real PostgreSQL server

All commands are local, synthetic and use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`.
The scripts deliberately use loopback port 55432 and disposable databases. Never
point them at a hosted or shared server. The cluster uses trust authentication
**for these disposable local fixtures only**. It requires a local PostgreSQL binary
directory (`initdb`, `pg_ctl`, `postgres`); this run used PostgreSQL 18.6 from the
public `@embedded-postgres/linux-x64@18.6.0-beta.19` platform package, installed
outside the repository, with no package/dependency changes.

```sh
export SKIP_AUTO_SHIP=1 AUTO_SHIP=0
MEMBER_TEST_PG_BIN=/path/to/postgresql/bin node tests/gia/local-postgres.mjs
```

In another terminal:

```sh
export SKIP_AUTO_SHIP=1 AUTO_SHIP=0
node tests/gia/real-postgres-probes.mjs
MEMBER_REAL_PG_TEST=true \
MEMBER_TEST_PG_URL=postgres://postgres@127.0.0.1:55432/member_hardening_test \
node tests/gia/member-demo-server.mjs
```

The SQL probe creates/drops only `member_hardening_sql_probe`. The browser harness
resets only the designated `member_hardening_test` schema. Both use an owner only
for migrations/fixture seeding. Actual application queries and malicious probes
connect as `member_runtime`, set request scope, then `SET LOCAL ROLE member_app`.
The local browser harness now refuses to run without the real-PG fixture flags.
Stop it and the disposable cluster with Ctrl-C when finished.

```sh
export SKIP_AUTO_SHIP=1 AUTO_SHIP=0
npm run lint
npx tsc --noEmit
npx vitest run --maxWorkers=1 --no-file-parallelism
XDG_CONFIG_HOME=/tmp/spike-wrangler-config \
NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/tests/gia/font-mock.cjs" npm run build:cf
MEMBER_LOCAL_DEMO=true GIA_PILOT_ENABLED=true \
GIA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/member_hardening_test \
npx playwright test --timeout=90000
```

The shared SQL probes run against both PGlite and actual PostgreSQL. The latter
specifically tests malicious RESET ROLE using an actual restricted LOGIN, not a
session-role simulation. It prints server version and session identity plus the
passed scenario names, without secrets. Independent SPIKEDEV real-SQL checking,
Claude Q1 and ChatGPT Rule 9 remain required at the published exact HEAD.

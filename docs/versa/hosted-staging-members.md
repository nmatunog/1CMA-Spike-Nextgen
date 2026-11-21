# Hosted staging member runtime — draft, no deployment

Source: [SPIKEDEV / owner decision, Nov 21](https://github.com/nmatunog/NEXO/issues/32#issuecomment-7061385382).
Base: staging merge `a1ecc4ede3bd668323ec07e04b3b6d0290685b25`.

## Boundary and reuse

`MEMBER_HOSTED_STAGING_ENABLED` defaults off. It enables the existing member
service only for `nextgen-staging.nmatunog.workers.dev`, with its exact HTTPS
public origin. Pilot, production, other Workers and lookalike hosts stay closed.
Local demo keeps its explicit opt-in, HTTP loopback origin and matching loopback
canonical/member database rules. The request host is passed from HTTP handlers;
server pages and Auth.js callbacks obtain it from the request headers.

The hosted branch requires staging's email-verification skip switch because no
real mail adapter exists. Its mail adapter always refuses sends; it does not
write synthetic messages into a hosted mailbox. Forgot password retains the
existing staging-unavailable response. The skip is a staging test exception,
not a claim that the email owner has been verified externally.

The unsigned GET remains display-only. Only validated POST can issue the existing
signed single-use ticket and enter the existing proof-gated password/activation
flow. Password minimum, rate limits, stored hash, account-conflict behavior,
HMAC capabilities, restricted LOGIN checks and transaction-local RLS scopes stay
in place. No new SQL migration or identity/entitlement bypass is introduced.

The verifier is still **designated synthetic FREE/PRO inventory**. An arbitrary
email/code captured for display is not automatically eligible for account
activation. Use fictional `example.test` emails and the existing available
`FREE-SYN00001`–`FREE-SYN00040` or `PRO-SYN00001`–`PRO-SYN00040` fixture inventory,
excluding expired/redeemed/revoked/wrong-owner entries. Real authoritative Versa
verification, L1/L2 entry checks and enrollment remain separate work. Sponsor
names remain unverified display data, not trusted recruiter attribution.

## Connection lifecycle

No module-level PostgreSQL client is retained. Each awaited DB operation opens
one client and transaction, checks `member_runtime`, sets the scope, drops to
`member_app`, and closes in `finally`. An atomic service transaction shares that
single client. Connections are never reused across requests, including errors.
The only retained verifier fixture is in-memory data, not a socket.

The hosted URL uses `member_runtime`, a password, and `sslmode=require`; it may
point to the isolated Neon pooled endpoint. No Hyperdrive binding is used or
changed. Proof-key configuration must match the existing private DB key; this PR
neither provisions nor reads that key. Local smoke uses TLS loopback PostgreSQL
instead of Neon, with a disposable certificate trusted only by the test runtime.

## Future owner-operated staging wiring (names only; no secret values)

New/required Worker secrets:

- `MEMBER_DATABASE_URL` — isolated member DB, restricted runtime user, TLS required.
- `MEMBER_SESSION_SECRET` — at least 32 characters, never a build placeholder.
- `MEMBER_DB_PROOF_SECRET` — 64 lowercase hex characters, matches private DB key.

Required member vars:

- `MEMBER_ONBOARDING_ENABLED` — explicit opt-in.
- `MEMBER_PUBLIC_ORIGIN` — exact HTTPS staging origin.
- `MEMBER_HOSTED_STAGING_ENABLED` — explicit opt-in, default off.

Existing dependencies to retain:

- `AUTH_SECRET` secret — at least 32 characters, no development/build fallback.
- `MEMBER_EMAIL_VERIFY_STAGING_SKIP` var — explicit staging-only opt-in.
- `VERSA_GET_STAGING_ENABLED` var — capture opt-in.

`MEMBER_LOCAL_DEMO` stays off on hosted staging. No canonical `DATABASE_URL`,
issuer secret, mail provider or Hyperdrive is needed for the GET-preview path.
Existing staff/GIA configuration is independent and must not be replaced.
No values, hosted connection strings or real identities belong in the PR.

SPIKEDEV reports the isolated Neon DB/migrations ready. This draft does not
connect to it, create a password/role, change secrets, Access or infrastructure.
Deployment remains gated on SPIKEDEV second-check, Claude Q1 and ChatGPT Rule 9
at the frozen SHA, followed by Nilo's explicit merge/deploy approval.

## Local workerd smoke

After `build:cf`, point `MEMBER_TEST_PG_BIN` at local PostgreSQL binaries and run
`node tests/gia/worker-hosted-member-smoke.mjs` with `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`.
The script creates/deletes its own cluster on loopback port 55433, applies only
local migrations, supplies ephemeral secrets, enables TLS/SCRAM and runs the
actual compiled Worker via `wrangler dev --local`. HTTP requests go to loopback
with the staging Host header. It never fetches the hosted staging app or Neon.

Checks: GET capture, read-only signup, validated password POST, active verified
synthetic account, zero mail, two Auth.js sign-in/sign-out cycles, zero remaining
member DB connections, and no raw email/code in the Worker log. The existing
flag-off redirect/capture smoke remains a separate gate.

The postgres.js 3.4.8 Worker adapter currently logs `This socket has been closed`
on intentional TLS client shutdown. Record this upstream cleanup diagnostic
separately from HTTP/SQL results; do not suppress runtime errors to claim a clean
log. The smoke verifies the actual results and absence of remaining DB sockets.

## Author validation

All commands used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` and synthetic local data.

- Lint and plain `tsc --noEmit`: PASS.
- Vitest: **874 tests / 56 files**, all PASS (serial workers).
- `build:cf`: PASS; handler gzip-9 **1,195,702 bytes**, below 3 MiB.
- Playwright: **64 unique cases PASS across four modes**: main 57 PASS / 7
  mode-dependent skips, capture-only 4 PASS, staging skip 2 PASS, disabled pilot
  1 PASS. None of those seven remain unexecuted.
- Existing local Worker capture/redirect smoke: **21/21 PASS**.
- New flag-on local Worker + TLS/SCRAM PostgreSQL smoke: **11/11 PASS**,
  including two sign-ins/sign-outs, zero mail and zero surviving member sockets.
- Socket-close diagnostics described above occurred; no HTTP/SQL assertion failed.
- Approved answers fingerprint recomputed unchanged:
  `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438`.

These are author checks, not independent QA. No hosted DB connection, hosted UI
validation, merge, deployment, email send or Access/secret/infrastructure change
was performed. Exact-head SPIKEDEV and Claude reviews remain required.

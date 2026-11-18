# Credential and pending-write proofs — draft follow-up

Base: `mvp01/staging-cf` at `2f55361fa929ba35340fe36334bfda06132bea20`
(the #28 merge). Sources: [Claude Q1](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/28#issuecomment-6970120015),
[SPIKEDEV QA](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/28#issuecomment-6969860386),
and Claude's owner-decision corrections
[6981272955](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/28#issuecomment-6981272955),
[6981337084](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/28#issuecomment-6981337084),
[6981362979](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/28#issuecomment-6981362979).

## LOW-A

Migration 0014 is additive; migrations 0012/0013 are unchanged. It revokes direct
INSERT/UPDATE on credentials and challenges, and INSERT/UPDATE/DELETE on pending
signups. Scoped SELECT policies remain. Knowing an exact victim email/account or
rebinding GUCs no longer permits direct password/pending/challenge modification,
even after RESET ROLE to the actual restricted member_runtime login.

All new functions are migration-owner SECURITY DEFINER, have fixed
`search_path = pg_catalog, public`, qualified public-table references, no dynamic
SQL, no PUBLIC execute, and EXECUTE granted only to member_app. Every function
first uses 0013's private HMAC authorizer. No new key mechanism is introduced.
Exact action/arguments, expiry, one-use nonce and constant-time MAC verification
remain enforced. Failed authorization returns false before touching application
rows. Proofs/keys are never rendered, returned, or logged by the new code.

| Capability/action | Exact proof claims, in SQL parameter order |
| --- | --- |
| create_credential | account, email, salt, hash |
| set_password | account, salt, hash, version |
| bump_auth_version | account, version |
| stage_pending | handoff, email, salt, hash, expires |
| delete_pending | handoff |
| rekey_pending | old, new |
| prune_pending | now |
| create_challenge | token, kind, account, email, handoff, expires |
| consume_challenge | token, kind |
| prepare_challenge | token, kind |

Times are epoch milliseconds; account ids are UUID strings; nullable claims are
explicit JSON null, never omitted/undefined. The server write helper rejects
missing/extra/undefined claim keys before signing. SQL reconstructs its own exact
JSON object from parameters and rejects mismatches or extra claims.

Credential creation requires a pending canonical account, verified matching
candidate, and an unexpired verified handoff claimed by that account. It inserts
only; conflicts never overwrite. The service checks the code, claims the handoff,
creates credentials and activates the account in one transaction. A failure rolls
back all changes and preserves the 409 conflict response.

Password reset/change use compare-and-set auth_version, incrementing it atomically;
logout likewise bumps only the expected version. Direct SELECT FOR UPDATE would
require the revoked UPDATE privilege, so the service uses ordinary scoped reads,
CAS password updates, its existing email advisory lock for signup/activation, and
the same lock for pending-password reset. Challenge lookup retains 0013's
proof-gated owner row lock and single-use checks. Pending rotation remains within
the same transaction as email verification/reset; it requires matching immutable
handoff payloads and a verified, live, unclaimed destination. Repeated signup
preserves an existing unexpired pending password. Reset can replace that specific
handoff's pending password, preserving its expiry. Expired-pending pruning now has
its own proof-bearing capability to preserve the existing server-clock cleanup.

Challenge creation/retirement, preparation and consumption are protected too.
Issuance is serialized per identity/kind, retires the previous matching challenges
and inserts one token. Preparation/consumption bind token hash and kind; consumption
requires unexpired, unconsumed state. Password change retires that account's open
reset challenges through individual token-bound proofs.

Scoped SELECT remains a row filter, not an identity sandbox against raw SQL that
knows an exact victim identity. This draft removes the LOW-A write/takeover path;
it does not claim proof-gated reads. The accepted LOW-B claim/rate policies remain
unchanged, per the owner's superseding decision.

## Sponsor display

Signup keeps the read-only Name / Email / Sponsor / Access code summary.
The account page no longer queries sponsor storage or passes a sponsor prop.
No other member-facing page or JSON response is extended with sponsor details.
The copied sponsor names and variable data remain stored in member_handoff_claims.
Versa owns attribution; 1CMA does not assign or edit it.

## Validation and review

Use the existing [disposable PostgreSQL runbook](hosted-hardening.md). All commands
use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`, synthetic fixtures and loopback databases only.
The shared battery retains all 18 #28 scenario groups and adds 12 LOW-A groups
(30 total). Each of the ten new functions is tested against no/forged/expired/
wrong-action/extra-claim/swapped-argument/replayed proofs plus a valid proof.
Real PostgreSQL tests run both as SET LOCAL ROLE member_app and after RESET ROLE
as the actual member_runtime login. Additional probes check overwrite/version
invariants and all revoked DML, including active-password takeover attempts.
Browser tests retain signup sponsor display, verify it is absent after signup
(including page HTML and session/API responses), and confirm database preservation.

No hosted migration, credential provisioning, real mail, deployment or merge is
included. runtime.ts and hosted 503 rules, auth.ts, issuer/ticket transport,
lib/vendor, GIA source/wording and LOW-B policies are unchanged. Independent
SPIKEDEV → Claude Q1 → ChatGPT Rule 9 is still required at the published exact SHA.

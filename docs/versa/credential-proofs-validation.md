# Codex validation: LOW-A and signup-only sponsor display

Base: `2f55361fa929ba35340fe36334bfda06132bea20`, the #28 merge on staging.
The published exact head is recorded on the draft PR. This is Codex implementation
evidence; independent SPIKEDEV, Claude and ChatGPT review is pending.

All gates used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`, synthetic data, disposable loopback
PostgreSQL 18.6 and the actual restricted `member_runtime` application login.

| Gate | Result |
| --- | --- |
| lint | PASS, no lint errors/warnings; existing Next lint deprecation notice |
| plain `tsc --noEmit` | PASS |
| Full serial Vitest | PASS, 814 tests / 50 files |
| Member lifecycle tests | All existing 57 cases PASS |
| Real SQL probes | PASS, 30 groups (all 18 #28 groups + 12 LOW-A groups) |
| build:cf | PASS; handler raw 5,022,907 bytes; gzip-9 **1,188,445 bytes**, under 3 MiB |
| Full Playwright | PASS, 53 passed / 1 expected disabled-pilot skip; all 8 member cases PASS |
| Disabled-pilot Playwright on separate local server | PASS, 1 case |
| Owner-approved answers | Unchanged: `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438` |

The shared SQL aggregate remains one Vitest case; it now runs 30 scenario groups,
so the full Vitest count remains 814. Real-PG probes additionally exercise actual
RESET ROLE session semantics. The SQL report identifies PostgreSQL 18.6 and
`session_user=current_user=member_runtime` outside the per-probe transactions.
The full browser member flow also uses that login; fixture-only migrations and
mailbox assertions use a separate local owner connection.

Each of the ten new functions rejects missing, forged, expired, wrong-action,
extra-claim, mismatched-argument and replayed proof attempts. On real PostgreSQL,
invalid-proof attempts execute both after SET LOCAL ROLE member_app and after
RESET ROLE to member_runtime. Positive function calls work as that restricted
login too. Direct credential INSERT/UPDATE, pending INSERT/UPDATE/DELETE and
challenge INSERT/UPDATE fail with permission denied after rebinding a known
active member's identity, in both role contexts. Credential creation cannot
overwrite, and a stale auth_version cannot reset a password. Prior #28 account,
private-key, scope, definer ownership/search-path, RLS and issuer replay assertions
remain in the shared battery unchanged.

Browser assertions keep the signup sponsor summary; after signup they check
verification/account/reset page content and HTML plus session/API responses for
absence of the synthetic sponsor and sponsor fields. Database assertions verify
both sponsor names and variable data remain stored, including the existing-account
handoff. Signup, verification, later signin, forgot/reset expiry/reuse, password
change, signout, pending password isolation and staff isolation all pass.

An initial targeted run caught the server-clock expired-pending cleanup being
lost when direct DELETE was removed. The proof-gated prune_pending capability
restores it, and the retained regression passes in the final full suite. No gate
failures or environment restrictions remain. Build fonts use the existing local
mock; Wrangler logs use a temporary XDG configuration directory. No dependency
or package-lock change was made.

No merge, mark-ready, deployment, hosted SQL, credential/key provisioning or real
mail occurred. Nilo's staging redeploy HOLD remains. Hosted runtime still fails
closed. The accepted LOW-B policies, GIA/owner wording, auth.ts, vendor verifier,
runtime.ts, issuer/ticket transport, and migrations 0012/0013 are unchanged.
Scoped reads remain GUC filters; the follow-up protects the approved write paths,
not an arbitrary-SQL identity sandbox for reads. Independent SPIKEDEV second-check
then Claude Q1 then ChatGPT Rule 9 must use the new exact published SHA.

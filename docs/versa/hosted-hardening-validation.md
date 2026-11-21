# Codex validation — member hosted hardening

Draft implementation based on staging merge `e08e1e34b83a9e69f90975c49ad8021bb28a3a40`.
This is Codex implementation evidence, not SPIKEDEV second-check, Claude Q1 or
ChatGPT Rule 9. Those reviews must use the published exact commit recorded on the PR.
No hosted SQL, role provisioning, merge, deployment or live email occurred.
Nilo's nextgen-staging redeploy HOLD remains.

All gates used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`, synthetic fixtures only.

| Check | Result |
| --- | --- |
| Lint | PASS, no warnings/errors from lint (Next lint deprecation notice only) |
| Plain `tsc --noEmit` | PASS |
| Full serial Vitest | PASS, 814 cases across 50 files |
| Member service lifecycle | PASS, all 57 cases retained |
| Expanded shared SQL unit probe | PASS, aggregate case executes all 18 scenario groups |
| Real PostgreSQL SQL probes | PASS, PostgreSQL 18.6, actual `session_user=member_runtime`; 18 scenario groups |
| Offline GIA build | PASS |
| Disposable PostgreSQL starter | PASS; fresh cluster repeated all 18 real SQL groups |
| Cloudflare build | PASS; handler raw 5,008,201 bytes, gzip-9 1,196,046 bytes (< 3 MiB) |
| Full Playwright | PASS, 53 passed / 1 expected disabled-pilot skip; all 8 member cases passed on actual restricted LOGIN |
| Separate disabled-pilot Playwright | PASS, 1 case |
| Owner wording | Unchanged, `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438` |

The parent had 829 Vitest cases. The former 20-case account-RLS file is now one
shared scenario aggregate (-19), and runtime fail-closed configuration adds four
cases (+4), hence 814. The shared scenarios retain the credential/challenge,
candidate, ownership/search-path and FORCE-RLS checks alongside the new proof,
handoff/pending-scope and replay checks. They also execute over a real PostgreSQL
wire connection with an actual restricted LOGIN. PGlite does not simulate RESET
ROLE session authentication in this aggregate; the real-PG companion tests it.
The final expanded aggregate was rerun after adding the additional SQL scenarios;
application source was unchanged from the full unit run and successful build.

## SQL evidence

`node tests/gia/real-postgres-probes.mjs` uses a separately created/dropped
`member_hardening_sql_probe` database on disposable loopback PostgreSQL. The app
browser harness uses `member_hardening_test` on the same disposable cluster.
Actual member requests never connect as the fixture owner.

The 18 SQL scenario groups cover:

1. GUC rebinding after dropping to member_app, both before and after RESET ROLE,
   cannot create/activate without server proof.
2. Wrong key, null MAC, tampered claims, wrong action, expiry and replay are rejected.
3. Unscoped handoff/pending reads return zero; own scope excludes another identity.
4. Raw account DML and handoff payload/verification writes are denied after RESET ROLE.
5. Private proof key and helper are inaccessible.
6. Exact token-hash challenge lookup requires a server proof.
7. Activation rejects unverified, expired or email-mismatched handoffs, even with valid MAC.
8. Creation requires a verified candidate and matching candidate/handoff email.
9. Credentials/challenges/candidates retain own-scope reads and clear between transactions.
10. Fixed function search paths/owner, FORCE RLS and candidate reassignment prohibition remain.
11. Valid verified handoff proof creates pending once; replay fails.
12. Valid activation affects the exact pending account once; replay fails.
13. Disabled accounts remain disabled even with valid server proof.
14. Legacy unproved function signatures are not executable.
15. gia_app/anon/authenticated cannot read member tables or execute the capabilities.
16. Unsigned handoff rotation is rejected.
17. Canonical own-account reads stay scoped, unused columns and DELETE remain denied.
18. An absent private DB key fails closed with otherwise valid proof/state.

## Gate environment and limits

The first build attempt used another worktree's symlinked node_modules and failed
while bundling native Sharp modules; Wrangler also could not create its default
home-directory log path. Installing the existing locked dependencies directly in
this worktree and using `XDG_CONFIG_HOME=/tmp/spike-wrangler-config` resolved both.
The final Cloudflare build passed, with no dependency or package-lock changes.
Font downloads use the existing local font mock; no deploy command was run.

Only synthetic local mail and verifier fixtures are available. Hosted runtime
continues to fail closed. Real mail, authoritative verification, identity mapping,
Access/logging review, hosted key/login provisioning and owner release approval
remain separate dependencies. Mutable GUCs are defense-in-depth read scopes, not
a claim that all arbitrary SQL is an identity sandbox. Published source is draft
work; successful local tests do not constitute independent QA or a release.

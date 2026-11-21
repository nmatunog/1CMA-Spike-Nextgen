# LOW-1 / LOW-2 validation — 18 November 2026

These are Codex implementation checks, not independent QA. SPIKEDEV second-check,
Claude exact-head Q1 and ChatGPT Rule 9 remain required. Nothing was deployed.
All commands used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` and synthetic data only.

| Gate | Evidence |
| --- | --- |
| Lint | `npm run lint`: PASS |
| Plain TypeScript | `npx tsc --noEmit`: PASS |
| Full Vitest | Clean final `npm test -- --maxWorkers=1 --no-file-parallelism`: **50 files / 829 tests PASS**, no failures or skips |
| Cloudflare build | `npm run build:cf`: PASS; handler gzip level 9, deterministic timestamp: **1,208,039 bytes**, below 3 MiB |
| Full production-build Playwright | `MEMBER_LOCAL_DEMO=true GIA_PILOT_ENABLED=true npx playwright test --timeout=90000`: **53 PASS, 1 expected skip**; all 8 onboarding tests PASS |
| Disabled pilot | The one skipped test was run separately against a disabled server on loopback port 3003: **1 PASS**, API returns 503 `pilot_disabled` |

The build uses the repository's existing Google-font mock fixture via
`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`; the approved member/landing Inter font is local.
Browser checks ran Chromium against Next.js production mode, with an ephemeral local
PGlite database. No hosted worker execution or real-provider integration was tested.

Initial validation found two historical tests assuming no migration after 0011.
Their assertions now check ordering and preservation of the AIA schema; the affected
files passed all 19 tests on rerun. The initial browser run found a replacement
verification link failing in an already-open tab; the fixed hash-change handling
passes the full suite, including expiry and replay checks.

Protected artifacts are byte-identical to the #26 merge on staging at `f67ab99`:
the knowledge pack, credential-safety module, owner-wording JSON/Markdown and
approved public landing images. Recomputed answer fingerprints:

- All nine entries: `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438`.
- Original eight: `2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad`.

See [test matrix](member-test-matrix.md), [contract and dependencies](member-onboarding.md),
and [screenshots](../screenshots/versa-members/README.md).

## Rule 9 follow-up evidence

- Signed issuer bodies, duplicate JSON, sponsor/signature tampering, stale timestamps,
  nonce replay, expiry and parallel ticket consumption: service regressions PASS.
- Independent pending passwords, real-holder recovery, generic arrival/signup and
  expiry/rate limits: unit and real browser regressions PASS.
- Local plain-query fallback requires explicit opt-in; default-off/hosted runtime
  remains closed. Alternate code format is tested only through the injected adapter.
- Activation under `member_app`, FORCE RLS, minimal canonical columns, denial of
  mailbox-link reads/candidate names/program-role writes and public/GIA access:
  service regressions PASS. Runtime browser checks use that actual role too.
- Initial browser follow-up: 52 PASS, one new test incorrectly expected an alert
  instead of the generic proof flow. A rerun then exposed startup readiness and
  PGlite's shared-backend unnamed-portal interleaving in the direct test reader.
  The harness now waits for readiness; direct reader queries are transactional.
  Final complete run: **53 PASS, 1 expected skip**; separate disabled check PASS.

No hosted worker execution, real email, authoritative live inventory or Access
policy was tested or changed. Signed tickets remove payload values from the
supported browser URL, but upstream ticket/header logging and obsolete plain URLs
cannot be redacted by this Worker. See the explicit hosted-release hold and Access
plan in `member-onboarding.md`. No new independent QA is claimed for this head.

## Historical Claude M1 correction at 4b70c49

Brief: NEXO #32 comment 6953819929; blocked source `5b23ff0`. A fresh local PGlite
probe applied the exact old SHA's migrations and reproduced: an unscoped SELECT
read 3 accounts, disabled→active updated 1 row, and an already-active INSERT
created 1 row. No live database was used.

The 12 new `account-rls.test.ts` probes bind request identity before SET LOCAL ROLE,
with FORCE RLS enabled. Empty scope reads no accounts/candidates; own scope returns
only the owned account/current verified email. Disabled reactivation and cross-row
updates affect zero rows; active INSERT and DELETE are rejected. Candidate
reassignment and unused created_at reads are denied. An owned pending INSERT and
pending→active transition succeed. Scope does not leak to a later transaction.

The existing 54 service cases and all 8 browser member cases pass, including actual
runtime role use for signup, later sign-in, linking, email reset and session checks.
SELECT(candidate_id) remains necessary for the conflict arbiter; UPDATE(candidate_id)
is revoked and the member flow no longer calls the shared helper's no-op update.
GIA, approved answers, handoff/ticket code and vendored verifier are unchanged.
CI status is recorded on the PR at the pushed exact SHA, separately from local gates.

## LOW-1 / LOW-2 follow-up

Read Claude 6964000010, SPIKEDEV 6963665278 and NEXO #32 6964000311. The new account
writes are fixed-path migration-owner SECURITY DEFINER functions with private
EXECUTE ACLs. Direct account DML privileges/policies are removed. Credentials and
challenges have per-command scope policies; a separate private exact-hash/kind
lookup supports scope-free verification/reset discovery with row locking.

20 direct SQL role tests and 57 service cases pass; the complete serial unit run is
**50 files / 829 tests PASS**. The production-build browser run is **53 PASS / one
expected skip**, with the disabled-pilot case separately **1 PASS**. Lint, plain tsc
and build:cf pass; handler gzip-9 is **1,208,039 bytes**. The required hosted-login
model is documentation only. No hosted database, role, provider, policy or release
was changed. Mutable scope remains defense-in-depth for reads, not an arbitrary-SQL
sandbox; existing server proof/password/code checks and hosted holds remain required.
All user-protected files and the wording fingerprint are unchanged from 4b70c49.

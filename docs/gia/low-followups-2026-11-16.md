# GIA LOW follow-ups — engineering handoff

Stacked on draft PR #23, branch `claude/gia-generic-credential-retention`, initial requested base `8d805eee36ebca0cca9cd84ad43911b90133765c`. During validation Claude advanced #23 through `31ab36b` to `d0a146c39361fb15f8a2c18736d5aa8c1c45246d`; those commits were inherited unchanged before final validation. The final stack base is `d0a146c39361fb15f8a2c18736d5aa8c1c45246d`. Work branch: `codex/gia-low-followups`. PR #21/#22/#23 heads are not updated by this work.

## Scope and regressions

- LOW-N3: password-sharing advice in English/Cebuano/Tagalog now requests a leader with the exact existing KP-REC-01 safety sentence and existing localized handoff. No new live safety wording was needed. Credential disclosure still wins before advice routing. No credential detector or storage changes.
- LOW-W1: the application-submission matcher excludes insurance, policy/policies, policyholder, claim(s), premium(s), seguro and polisa. Advisor recruitment questions retain KP-REC-08. Only the matcher changes for this finding.
- LOW-N6: `can't`, `can’t`, `cannot` and `unable` are account-question exceptions, routing failed AIA/iRecruit logins through the existing leader handoff. Normal prospective-advisor login questions retain registration guidance; SPIKE/FEP questions retain their separate routing.
- LOW-N1: valid encoded spaces and UTF-8 destinations are allowed. Every decoding layer rejects encoded slash/backslash; controls, malformed encoding and dot traversal segments remain blocked. Encoded non-traversal filename dots are allowed. Generic join-us-now and iRecruit destinations stay blocked, including nested encodings. Raw spaces and ambiguous literal-percent forms remain fail-closed.
- LOW-D2: actual runtime KP-REC-02 v0.2 `reviewBy` is **2026-12-13**, as was its original v0.1. Other selected entries use **2026-12-14**. Corrected documentation only; no validity dates in code changed.
- LOW-D3: corrected the stale KP-REC-08 snapshot note to reflect insertion into runtime in PR #22. The answers fingerprint remains unchanged, but the full JSON file hash changes because its metadata note changes.
- LOW-D4: corrected the previous Cebuano correction report to distinguish 3 owner-ordered edits from 3 SPIKEDEV-suggested edits, all subsequently authorized by the owner.
- INFO-1: Vitest's global hook timeout is now 30 seconds for cold synthetic PGlite setup; regression verifies configuration. Global test timeout is unchanged. The existing synthetic seed test initializes cold PGlite in its body, so that single test also receives an explicit 30-second budget after the first full run exposed its 5-second timeout.

Unit regressions cover all six requested items. Browser regressions exercise three-language sharing advice, policyholder exclusion and failed login handoffs.

## Wording and file hashes

The 24 approved answers and their id/version/answers SHA-256 are unchanged:
`2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad`.

`docs/gia/owner-wording-2026-11-16.json` full-file SHA-256:

- Before: `a833dc760a7def78e867716a59cc247031cfe678b1bf70c0b2d0a275f0e6c524`.
- After: `7cead3c292d539b80dc99b0f7ffc8bedfd7be091e29bb82274b149c330cea006`.

Both `lib/gia/credential-safety.mjs` and `lib/gia/knowledge/domains/recruitment.mjs` are byte-identical to the PR #23 base. No username/email/007-number credential work is included.

## Validation before upstream refresh

All gates use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` and synthetic data only. Runtime source was frozen before final validation; the later browser-test correction only fixes an empty-composer assertion and was followed by TypeScript and a complete browser rerun. The local font fixture is used by offline/Cloudflare builds. Results on the initial base (superseded by the final-base gates below):

- PASS: lint and plain TypeScript (`npm run lint`, `npx tsc --noEmit`); TypeScript repeated after the browser-test-only correction.
- PASS: full Vitest, **540 tests / 41 files**, 191.01 seconds, single worker (`npx vitest run --maxWorkers=1 --no-file-parallelism`). No timeout override on the command: the checked-in hook timeout and the single cold-seed test budget apply.
- PASS: `npm run build:gia:offline`.
- PASS: `npm run build:cf`, using the existing Google Font fixture. OpenNext completed with a gzip-9 server handler of **1,140,472 bytes** (`gzip -9 -c .open-next/server-functions/default/handler.mjs | wc -c`). No dependency or build configuration changes were necessary with isolated `npm ci` dependencies.
- PASS: disabled-pilot browser check on a separate local server with `GIA_PILOT_ENABLED=false`: **1 test**, confirming HTTP 503 / `pilot_disabled`.

Initial-run failures and observations:

- First full Vitest run: 539 passed / 1 failed due to the existing seed test's 5-second cold PGlite timeout. The per-test budget described above resolved this; final full run passed.
- First browser run: 21 passed / 2 failed / 1 expected skip. Two new tests incorrectly expected Send to be enabled with an empty composer after changing language. Fixed the tests to wait for the language confirmation; runtime code did not change.

A subsequent full run passed (23 passed / 1 expected disabled-pilot skip) on the initial runtime build; an intervening run had 22 passed / 1 failure / 1 skip when the unchanged Command Center follow-up status stayed on the prior GIA event message. No Command Center code or test was changed for that transient failure; final-base browser results are recorded below. These are engineering checks, not independent QA; SPIKEDEV second-check precedes Claude Q1.

No merge, ready transition, deployment or live database operation is authorized or performed.


## Final gates on refreshed PR #23 base

Base: `d0a146c39361fb15f8a2c18736d5aa8c1c45246d`. Claude's two newer commits are inherited unchanged; this branch does not author credential matching/storage changes. No further runtime edits occurred during the refreshed gates.

- PASS: lint and plain TypeScript.
- PASS: full Vitest **640 tests / 41 files**, **176.49 seconds**, using the checked-in timeouts and a single worker.
- PASS: offline production build.
- PASS: Cloudflare build with existing font mock; gzip-9 `.open-next/server-functions/default/handler.mjs`: **1,145,004 bytes**.
- PASS: default-disabled pilot check on the refreshed build: **1 test** (2.6 seconds), HTTP 503 / `pilot_disabled`.
- PASS: full Playwright **23 passed / 1 expected skip**, 1.9 minutes (`GIA_PILOT_ENABLED=true npx playwright test --timeout=90000`); the skipped disabled-pilot case passed separately as recorded above. All **24 distinct browser cases** passed across the two configurations. No failures on this refreshed-base browser run.
- PASS: answers fingerprint and all 24 runtime/JSON/Markdown answers unchanged; credential safety source and recruitment runtime pack byte-identical to the final parent.

Remaining review dependency: SPIKEDEV exact-head second-check, then Claude Q1. Earlier transient Command Center browser timing behavior remains documented for reviewers; this follow-up does not alter Command Center behavior. No ongoing environment restriction prevented final gates.

## Changed files

- Runtime: `lib/gia/engine.mjs`, `lib/gia/visitor-hrefs.ts`.
- Tests/configuration: `lib/gia/low-followups.test.ts`, `lib/gia/visitor-hrefs.test.ts`, `tests/gia/low-followups.spec.ts`, `scripts/staging-migrate-seed.test.ts`, `vitest.config.ts`.
- Documentation: `docs/gia/owner-wording-2026-11-16.json`, `docs/gia/owner-wording-2026-11-16.md`, `docs/gia/owner-wording-implementation-2026-11-16.md`, `docs/gia/cebuano-corrections-2026-11-16.md`, this handoff.

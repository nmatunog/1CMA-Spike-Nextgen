# GIA Q1 follow-up — 14 November 2026

## Exact source and scope

- Parent: NEXO #32; owner explicitly reassigned Codex to SPIKE while Northern Sparadise is frozen.
- Repository: `nmatunog/1CMA-Spike-Nextgen`.
- Existing draft PR #19 head: `79059e65d20f546df86665bc35ca4316d09f4d78`.
- Local follow-up branch: `codex/gia-q1-credential-citation-fixes`.
- Published initial follow-up: `7c11d279f17f30435483505bd50fe93ef15e0b99` (combines unpublished local code `418a7e6` and documentation `3da07c0`).
- Review the latest published head of `codex/gia-q1-credential-citation-fixes`, including the SPIKEDEV second-check corrections below.
- Findings addressed: Claude Q1 comment `6871213160`, A (HIGH), C (MEDIUM), D (LOW).
- No merge, deployment, live database access, new data collection, paid service or Ollama integration.

## Original changes at published `7c11d27`

1. `lib/mvp01/engage.ts`: return null for transcript text classified as `aia_credentials`, even when passwords contain only ordinary alphabetic words. Allowlisted intent metadata remains available; refused turns already stored an empty reason before this patch.
2. `lib/gia/gia-api.test.ts`: route-level POST tests prove all three synthetic alphabetic credential messages are refused and stored with null text.
3. `lib/gia/visitor-hrefs.ts`: visitor destinations are restricted to root-relative local paths or HTTPS pages on the exact AIA public host. Refuse internal GitHub governance links, unsafe schemes, protocol-relative/backslash destinations, credentials in URLs, non-default ports, generic AIA registration and iRecruit URLs. Valid recruiter-attributed URLs remain supported.
4. `lib/gia/visitor-hrefs.test.ts`: render-level internal citation regression plus hostile URL cases and allowed destination checks.

The new tests were run before implementation and reproduced all three failures. After implementation, all 28 tests across the two targeted files pass.

## Historical evidence and limitations (before SPIKEDEV corrections)

- Historical baseline lint/typecheck passed. The initial follow-up Cloudflare build passed, but that did **not** validate test-file typing: SPIKEDEV subsequently found plain `tsc --noEmit` failing in `gia-api.test.ts`. See the second-check corrections below.
- `npm run build:gia:offline`: PASS at the PR #19 baseline.
- `npm run build:cf`: PASS with follow-up code; gzip-9 handler size 1,135,843 bytes.
- Initial baseline full Vitest invocation was not green: 338 passed, one test timed out, and two setup hooks timed out (15 skipped tests). Sequential retry of the affected suites passed all 20 tests. No production code was changed to hide test timeouts.
- Follow-up full sequential Vitest at code commit `418a7e6`: **37 files / 357 tests PASS**, zero skipped or failed, in 160.03 seconds (`npx vitest run --maxWorkers=1 --no-file-parallelism`).
- Local runtime: Node 24.22.1; upstream CI uses Node 22. Exact-head baseline CI is green: PR #19 run `43471572094`; PR #20 run `43469147037`.
- Browser suite attempted with `GIA_PILOT_ENABLED=true` against the local synthetic demo. Chromium aborted before page launch because this host denies `socket()`/ptrace operations. Ten tests failed at browser launch; one disabled-mode test correctly skipped. No application browser assertions ran. Reviewer must repeat on a browser-capable host.
- Synthetic demo was stopped after the attempt. No screenshots or production secrets were introduced.

## Remaining gates

- **B — KP-REC approval provenance:** unresolved. Existing KP-REC-01 through 07 refer to a policy/journey decision rather than proven approval of exact answer wording. Do not invent owner approval or rewrite approval metadata to imply it. Exact wording approval or a valid existing approval reference is needed before merge.
- **E/F/G — prior LOW findings:** not changed in this security follow-up. Visitor footer draft wording, public asset inventory and mobile fixed-bar overlap remain for the next bounded slice.
- Shared `lib/mvp01/aia-assisted-fields.ts` is unchanged and byte-identical between PR #19 and PR #20.
- PR #20 head remains `b895e1d9935c2f705f92e15c5070f239e487cd3f`, independently Q1 PASS in comment `6859700931`; awaiting ChatGPT final product/architecture review and owner release authority. Its unchanged gates were not redundantly rerun.

## Claude independent review request

Review the latest published fixes-branch HEAD (record its full SHA in the verdict) against PR #19 head `79059e65d20f546df86665bc35ca4316d09f4d78`; also consider the whole PR #19 diff against `21c33d3ddfa5d6184522861a01ed253ecc67fa35` so the earlier verdict is not lost.

Confirm that refused alphabetic AIA credentials are never written to `gia_turns.message_text`, that audit/engagement metadata remains allowlisted, and that internal governance/unsafe URL citations render as text. Verify valid attributed recruiter links and public AIA references still work and shared assisted fields remain unchanged. Repeat lint, typecheck, relevant tests and browser checks at the exact reviewed head on a capable host. Report PASS/BLOCKED with severity and SHA. Treat KP-REC provenance as unresolved until genuine evidence is supplied. Do not claim this patch fixes every earlier finding.

Codex implemented this follow-up and cannot provide its independent QA verdict. No Claude process has been launched from this workspace.

## Next implementation slice

After independent review and knowledge-provenance resolution: bounded welcome/GIA UX extension from the existing preview (SPIKE `Learn. Build. Grow.`, supplied GIA face asset, mobile-first cross-device chat, accessible direct next steps). Preserve backend/consent contracts, recruiter attribution and separate AIA/learning entitlements. The new UX is not implemented in this security patch.

## SPIKEDEV second-check corrections

Source: https://github.com/nmatunog/NEXO/issues/32#issuecomment-6874768351

SPIKEDEV tested published `7c11d279f17f30435483505bd50fe93ef15e0b99` and found one HIGH, two MEDIUM and two LOW findings. This was a second-check, not Claude Q1.

- HIGH-1: type the synthetic query result so plain TypeScript can check transcript assertions.
- MED-1: share conservative AIA credential detection between responses and persistence. Persistence checks text independently of refusal reason, covering rule-precedence, abbreviated, dotted AIA, Tagalog and Bisaya disclosures. Credential-related questions may also be discarded conservatively.
- MED-2: browser assertions require visible non-link citations and inspect actual visitor hrefs; intern checks require citation text to be absent, not merely its link.
- LOW-1: inspect decoded destinations, including nested encoding; malformed encoding fails closed. Keep valid attributed recruiter and public AIA links covered.
- LOW-2: identify the published commit and correct historical typecheck and refusal-metadata claims above.

These corrections require Claude exact-HEAD review; Codex validation is recorded below. KP-REC exact wording approval, footer wording, asset inventory and mobile footer overlap remain unresolved. PR #19/#20 heads and shared assisted fields must remain unchanged.

Validation also exposed an existing dated eval fixture: `seedSaturday` used the frozen 12 Nov knowledge date and produced a 14 Nov 09:00 UTC session, which had expired by this run. Keep knowledge evaluation frozen, but seed synthetic booking dates in the future relative to the real clock used by the repository. This is a test-fixture correction only; no production booking logic changes.

## Codex validation after SPIKEDEV corrections

Environment: Node 24.19.0; CI uses Node 22. All commands use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`; data is synthetic and local.

- `npm run lint`: PASS, no warnings or errors.
- `npm run typecheck` (`tsc --noEmit`): PASS, including test files.
- `npm run build:gia:offline`: PASS.
- `npm run build:cf`: PASS with the existing Google Font mock; gzip-9 handler 1,134,003 bytes.
- `GIA_PILOT_ENABLED=true npx playwright test tests/gia/browser.spec.ts tests/gia/mvp01-journey.spec.ts tests/gia/spike-preview-screenshots.spec.ts`: **10 passed, 1 expected disabled-mode skip**, no failures. Chromium launched successfully on this host. Includes the visible plain-text citations, intern denial, consent/booking/handoff/timeline flows and 390/1440 preview checks. The synthetic demo server was stopped afterward; generated screenshots were not added to this patch.
- Final sequential retry after build/browser work stopped: `npx vitest run --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 --testTimeout=15000`: **39 files / 369 tests PASS**, zero skipped or failed, 180.69 seconds. Timeout allowances are command-line only; no test assertions were disabled.
- First full sequential Vitest attempt overlapped build/browser work: **343 passed, 2 failed, 22 skipped; 3 files failed**. Failures were a 10-second API setup timeout, a 5-second synthetic seed timeout and the expired official-eval fixture described above. These results are not counted as PASS.

PR #19 remains at `79059e65d20f546df86665bc35ca4316d09f4d78`; PR #20 remains at `b895e1d9935c2f705f92e15c5070f239e487cd3f`. Shared assisted fields remain blob `fcfc4aad2dc11673db1802c63bd46e25360d238a`, identical to #20. No merge, deployment or live database action occurred.

## Owner-reported follow-up — 15 November 2026

The owner reported 11 retained variants out of 27 and false refusals of ordinary registration questions at `53ffad0`. Only the supplied examples are available here; do not claim all 27 have been verified.

- Storage now uses `mayContainAiaCredentials` independently of response selection. It covers `pass`, `pasword`, `passwrod`, dotted/zero-width AIA, and conservatively discards AIA account payloads even when their format is ambiguous.
- Conversational refusal uses a separate disclosure check, with explicit assignments taking precedence over question wording. Ordinary login, username and reset questions route to the existing approved KP-REC-01 registration guidance rather than the credential refusal. No recruitment copy, approval metadata or recruiter attribution was changed.
- Regression coverage includes the supplied credential examples, refusal-precedence cases, a disclosure followed by a question, ordinary account questions, API transcript inspection and the two reported ordinary questions in Chromium.
- Some harmless AIA credential/account questions may still have null transcript text by design. This conservative storage decision does not cause a credential-refusal reply.

The complete synthetic 27-phrase set was requested for additional coverage; it is not a prerequisite for fixing the examples already supplied. Claude exact-HEAD QA and existing KP-REC/footer/product gates remain outstanding.

### Follow-up validation record

- The first implementation run caught a false refusal of the reset-password question. It was corrected before publication.
- An interim full run passed 381 tests. A later run was started before the final helper/test edits had settled; it reported 383 passed and one failed exam-question regression against the earlier transformed helper. That mixed-source run is not the final validation result.
- The final frozen-source rerun, rather than either interim count, is the release-review evidence below.
- Final offline production build, plain TypeScript and lint passed. Chromium passed all three selected flows: ordinary account questions, intern FEP boundaries, and synthetic consent/Bisaya/booking/handoff/staff follow-up (3 passed, no skips). The local synthetic server was stopped and generated screenshots were excluded.

- Final frozen-source Vitest: `npx vitest run --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 --testTimeout=15000`: **384 tests / 39 files PASS**, zero failed or skipped, 174.01 seconds. This supersedes the interim runs above.

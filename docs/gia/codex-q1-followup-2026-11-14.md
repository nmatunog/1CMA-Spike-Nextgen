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
- At `3af741e`, a separate disclosure check corrected the specifically tested login/username/reset questions. This did not establish that all ordinary account questions were handled correctly: SPIKEDEV later found six false refusals and unrelated SPIKE/FEP questions misrouted to KP-REC-01. See the next correction below. No recruitment copy, approval metadata or recruiter attribution was changed.
- Regression coverage includes the supplied credential examples, refusal-precedence cases, a disclosure followed by a question, ordinary account questions, API transcript inspection and the two reported ordinary questions in Chromium.
- Some harmless AIA credential/account questions may have null transcript text by design. Storage and reply selection are separate; the historical `3af741e` reply logic still had the false refusals reported by SPIKEDEV.

The complete synthetic 27-phrase set was requested for additional coverage; it is not a prerequisite for fixing the examples already supplied. Claude exact-HEAD QA and existing KP-REC/footer/product gates remain outstanding.

### Follow-up validation record

- The first implementation run caught a false refusal of the reset-password question. It was corrected before publication.
- An interim full run passed 381 tests. A later run was started before the final helper/test edits had settled; it reported 383 passed and one failed exam-question regression against the earlier transformed helper. That mixed-source run is not the final validation result.
- The final frozen-source rerun, rather than either interim count, is the release-review evidence below.
- Final offline production build, plain TypeScript and lint passed. Chromium passed all three selected flows: ordinary account questions, intern FEP boundaries, and synthetic consent/Bisaya/booking/handoff/staff follow-up (3 passed, no skips). The local synthetic server was stopped and generated screenshots were excluded.

- Final frozen-source Vitest: `npx vitest run --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 --testTimeout=15000`: **384 tests / 39 files PASS**, zero failed or skipped, 174.01 seconds. This supersedes the interim runs above.

## SPIKEDEV MED-1 / MED-N1 / MED-N2 correction — 15 November 2026

Authoritative second-check: https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/21#issuecomment-6885438735 (reviewed `3af741e9b0af6059ea82e53f313d0bf26bfcc939`, NOT READY for Claude Q1).

- **MED-1:** normalize common Cyrillic/Greek ASCII look-alikes for security classification, recognize fused `aiapassword`, add secret/secret-word cues, and accept `irecruit: username / password` without requiring the word account. Storage stays independent of response intent and refusal reason.
- **MED-N1:** remove the arbitrary-words-after-login/username fallback. Refusal requires a supplied assignment, structured credential pair, explicit bare secret value, or an explicit presentation/instruction to use credentials. Ordinary future-tense, troubleshooting, Tagalog and Bisaya questions are not refused just because a login keyword appears. Login and username alone never use the bare-secret heuristic.
- **MED-N2:** AIA account guidance requires explicit AIA/iRecruit context. SPIKE, Literacy, Zoom/FEP and context-free account questions keep the existing leader-handoff response instead of receiving AIA registration instructions. Future account issuance and troubleshooting questions also keep leader help. No new policy answers or approved-copy metadata were created.
- Unit, API and browser regressions share `tests/gia/fixtures/credential-regressions.ts`: 27 synthetic disclosures assembled from the published examples, 7 AIA registration questions, 6 AIA leader-support questions and 7 other/context-free account questions. This is not claimed to be the exact unretrieved SPIKEDEV 27-probe corpus. All three original named registration/account questions are included.
- Before implementation, the new unit/API regressions reproduced **21 failed / 51 passed** checks. The first implementation also caught the existing explicit request to log in to iRecruit with a password; that refusal was preserved. Final targeted run: **183 tests / 3 files PASS**.

Remaining lower findings: LOW-N1 (legitimate encoded spaces/literal percent links fail closed), LOW-N3 (dedicated password-sharing safety guidance), plus prior KP-REC exact wording approval/provenance, footer wording, public asset inventory and mobile footer overlap. These are not claimed fixed by this patch. Claude Q1 remains gated on SPIKEDEV clearing the new exact SHA.

Current execution plan: complete this draft security/routing slice, preserve its exact head for SPIKEDEV second-check and Claude Q1, then continue the next authorized bounded G1/C1/V1 milestone from NEXO #32/#27 and Nextgen #7. Reuse existing delivered work. Mobile footer overlap is the next isolated UI correction; it must not move the security head under review or invent approved footer/knowledge wording. No merge, deployment, live-data or Northern Sparadise action is authorized.

Exact-wording owner gate is now prepared for review in [kp-rec-wording-approval-request.md](kp-rec-wording-approval-request.md): all seven existing versions and 21 language answers, with source/wording hashes. This is a request, not approval; no runtime approval flag or answer was changed.

Next UI finding is specifically Claude G: the fixed bottom bar covers the copy-card bottom in the consented `recruiter-cta-390.png` state. Inspecting the empty landing footer is insufficient to verify that finding. Reproduce the copy-card state and add a visible-controls/occlusion regression before changing padding in a separate branch.

### Final Codex validation for the MED-1 / MED-N1 / MED-N2 patch

- Node 24.19.0; CI uses Node 22. Synthetic/local only; `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` throughout.
- Targeted unit/API/engine regressions: **183 tests / 3 files PASS**.
- Frozen-source isolated full run: `npx vitest run --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 --testTimeout=30000`: **412 tests / 39 files PASS**, zero failed/skipped/errors, 211.06 seconds.
- Plain `tsc --noEmit`, lint and Cloudflare production build: PASS. Cloudflare build includes the Next production build using the existing Google Font mock.
- Full Chromium attempt: **12 passed, 1 expected disabled-mode skip, 1 screenshot-test timeout** at the 30-second test limit. The expanded AIA registration, AIA leader-support and non-AIA account groups all passed. Isolated screenshot retry with `--timeout=90000`: **1 passed in 24.1 seconds**, verifying both 390 and 1440. All 13 applicable browser checks therefore passed across the main attempt and retry; do not describe the first attempt as wholly green.
- An earlier overlapping full-unit attempt had **411 passed, 1 evaluation timeout and 1 worker RPC timeout error**. It is not the final gate result. Heavy build/browser activity was stopped before the clean full run above; no assertions were disabled and production code was not changed to hide timing failures.
- The synthetic server was stopped. Generated tracked screenshots were restored, not included in this security patch. Recruiter registration/knowledge text and shared assisted fields remain unchanged; assisted fields are still blob `fcfc4aad2dc11673db1802c63bd46e25360d238a` as on #20.
- Codex implementation/testing is not SPIKEDEV clearance or independent Claude Q1. Both must review the new published SHA. No merge, deployment, live database or Northern Sparadise work occurred.

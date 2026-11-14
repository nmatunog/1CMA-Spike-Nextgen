# GIA Q1 follow-up — 14 November 2026

## Exact source and scope

- Parent: NEXO #32; owner explicitly reassigned Codex to SPIKE while Northern Sparadise is frozen.
- Repository: `nmatunog/1CMA-Spike-Nextgen`.
- Existing draft PR #19 head: `79059e65d20f546df86665bc35ca4316d09f4d78`.
- Local follow-up branch: `codex/gia-q1-credential-citation-fixes`.
- Code commit for review: `418a7e63a821761d33d750a7f87694626bd251a3`.
- Findings addressed: Claude Q1 comment `6871213160`, A (HIGH), C (MEDIUM), D (LOW).
- No merge, deployment, live database access, new data collection, paid service or Ollama integration.

## Changes

1. `lib/mvp01/engage.ts`: return null for transcript text classified as `aia_credentials`, even when passwords contain only ordinary alphabetic words. Existing intent/reason metadata remains available.
2. `lib/gia/gia-api.test.ts`: route-level POST tests prove all three synthetic alphabetic credential messages are refused and stored with null text.
3. `lib/gia/visitor-hrefs.ts`: visitor destinations are restricted to root-relative local paths or HTTPS pages on the exact AIA public host. Refuse internal GitHub governance links, unsafe schemes, protocol-relative/backslash destinations, credentials in URLs, non-default ports, generic AIA registration and iRecruit URLs. Valid recruiter-attributed URLs remain supported.
4. `lib/gia/visitor-hrefs.test.ts`: render-level internal citation regression plus hostile URL cases and allowed destination checks.

The new tests were run before implementation and reproduced all three failures. After implementation, all 28 tests across the two targeted files pass.

## Evidence and limitations

- Lint/typecheck passed at the unchanged PR #19 baseline; the follow-up Cloudflare build also ran Next lint/type validation successfully.
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

Review the code commit `418a7e63a821761d33d750a7f87694626bd251a3` against PR #19 head `79059e65d20f546df86665bc35ca4316d09f4d78`; also consider the whole PR #19 diff against `21c33d3ddfa5d6184522861a01ed253ecc67fa35` so the earlier verdict is not lost.

Confirm that refused alphabetic AIA credentials are never written to `gia_turns.message_text`, that audit/engagement metadata remains allowlisted, and that internal governance/unsafe URL citations render as text. Verify valid attributed recruiter links and public AIA references still work and shared assisted fields remain unchanged. Repeat lint, typecheck, relevant tests and browser checks at the exact reviewed head on a capable host. Report PASS/BLOCKED with severity and SHA. Treat KP-REC provenance as unresolved until genuine evidence is supplied. Do not claim this patch fixes every earlier finding.

Codex implemented this follow-up and cannot provide its independent QA verdict. No Claude process has been launched from this workspace.

## Next implementation slice

After independent review and knowledge-provenance resolution: bounded welcome/GIA UX extension from the existing preview (SPIKE `Learn. Build. Grow.`, supplied GIA face asset, mobile-first cross-device chat, accessible direct next steps). Preserve backend/consent contracts, recruiter attribution and separate AIA/learning entitlements. The new UX is not implemented in this security patch.

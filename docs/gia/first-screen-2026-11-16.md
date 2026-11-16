# GIA first-screen simplification — draft engineering handoff

Branch: `codex/gia-first-screen`. Base: `mvp01/staging-cf` at `644e62a531e9f876dc62f2dac9f627a300f2f460`. Intended PR target: `mvp01/staging-cf` only.

## Visitor presentation

- Header says “GIA” / “Your AI guide. Ask away.” Opening message: “Hi, I'm GIA, your AI guide. What would you like to explore?”
- Three starter chips: “What is this?”, “Is it free?”, “How do I start?”. They select existing approved Financial Literacy / next-step answers, without signup or a new backend response.
- The existing “GIYA Institute — The SPIKE Method” line appears in conversation when “What is this?” is asked, rather than in the header.
- Removed the Recruit/Intern/RA segmented selector, implementation note and duplicated notice card from visitor presentation. New visitors start on recruit. Explicit first-person self-identification or the later optional plain-language path question selects existing public adapters. Ambiguous questions and arbitrary text are passed through; credential/crisis/STOP input is not rewritten.
- `?program=intern`, `?program=ra` and `?program=recruit` remain testing overrides on `/gia`. No role is verified, no entitlement is granted, and backend adapter/topic/tool restrictions remain authoritative.
- After a first interaction, limited next actions appear. “More options” reveals the existing larger quick-action collection; “Find my path” offers one plain-language question. FEP session actions stay contextual and recruit-only.
- Contact capture is deferred until requested or needed for booking/leader follow-up. The original fields, approved copy, checkbox state (unticked), submission and consent requirements are unchanged.
- One compliance paragraph under the composer keeps privacy, the always-available STOP action, the document warning and the exact insurance disclaimer. It wraps naturally on mobile; it is not shrunk into an unreadable unbroken line.

These are presentation changes. No engine, API, workflow, schema, AIA registration/attribution, entitlement or credential-safety implementation is changed. No new model/AI service, generic AIA/iRecruit link, secret or real reference link is introduced.

## Protected wording

`docs/gia/owner-wording-2026-11-16.json`, `lib/gia/knowledge/domains/recruitment.mjs` and `lib/gia/credential-safety.mjs` remain byte-identical to the base. The approved id/version/answers fingerprint stays:

`2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad`.

All 24 runtime/JSON/Markdown answers are checked by the existing owner-wording regressions. Approved consent constants are preserved verbatim.

## Screenshots

[Before/after comparison](../screenshots/gia-first-screen/README.md), 390 × 844 and 1440 × 1000. Both after captures were visually inspected. Automated geometry checks verify composer/compliance fit, no horizontal overflow, three initial chips and absence of the initial role selector/contact form.

## Validation

All commands use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`, synthetic data and local in-memory PGlite. Existing Google Font mock used for offline/Cloudflare builds. No `npm run ship`, merge, ready transition, deployment or live database change.

- PASS: initial focused unit regressions, 33 tests / 2 files. The frozen full run additionally covers the legacy student-chip canonical mapping regression.
- PASS: frozen full Vitest, 624 tests / 44 files, 216.96 seconds. Single worker with explicit 30-second hook/test overrides for the known cold-PGlite limits.
- PASS: lint and plain `tsc --noEmit`, repeated after browser expectation updates.
- PASS: `npm run build:gia:offline`.
- PASS: `npm run build:cf`; `.open-next/server-functions/default/handler.mjs` gzip-9 is 1,151,168 bytes, below 3 MiB.

Initial full browser run: 24 passed / 2 failed / 1 expected skip. Both failures were old presentation expectations: a disabled leader action remaining after STOP (now hidden while Send stays disabled), and a contact form shown immediately in the screenshot walkthrough (now explicitly requested). Updated tests retain STOP, crisis, consent, role boundaries and full workflow assertions. No runtime guard was weakened to satisfy a test.

- PASS: final frozen full Playwright run, 26 passed / 1 expected skip in 2.1 minutes. Covers all new first-screen cases, 390/1440 layout and screenshots, optional unticked consent, STOP/crisis, adapter restrictions, AIA attribution, booking, handoff and Command Center journeys.
- PASS: the one skipped check was run separately with the pilot disabled: 1 passed in 1.2 seconds, verifying HTTP 503 / pilot_disabled. All 27 distinct browser cases passed across the two configurations.

The earlier complete browser rerun also passed (26 / 1 expected skip). Before freezing, a final review caught that the new self-identification rule could intercept the existing student/intern chip label before its canonical prompt mapping. Mapping priority was corrected and a regression added, then lint, TypeScript, full Vitest, both builds and full Playwright were repeated on the frozen runtime source.

Exact-head CI is tracked on the GitHub PR after publication, without advancing source just to record a CI URL. Engineering validation is not independent SPIKEDEV/Claude approval.


## Changed files

- UI: `app/gia/page.tsx`, `components/gia/GiaChat.tsx`, `components/gia/gia-chat.module.css`, `lib/gia/ui-copy.ts`, `lib/gia/first-screen.ts`.
- Tests: `lib/gia/first-screen.test.ts`, `lib/gia/spike-preview.test.ts`, `tests/gia/first-screen.spec.ts`, `tests/gia/browser.spec.ts`, `tests/gia/mvp01-journey.spec.ts`, `tests/gia/spike-preview-screenshots.spec.ts`.
- Evidence: this handoff; `docs/screenshots/gia-first-screen/README.md`; before/after PNGs at 390 and 1440 widths.

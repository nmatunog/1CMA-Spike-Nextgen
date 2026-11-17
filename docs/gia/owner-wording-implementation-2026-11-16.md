# Owner wording implementation — 16 November 2026

This isolated draft is based on PR #21 head `89dde2024124bad4e826fc3212f061b8e367d7e0`. PR #19, #20 and #21 heads are preserved. The mobile copy-card work remains in its own worktree and is not part of this change.

## Selected wording and provenance

The owner edited/reviewed the recruitment responses one at a time in the Codex conversation, requested conversational/street Cebuano and Tagalog, and accepted the aligned translations. The resulting eight responses / 24 exact answers are recorded in [owner-wording-2026-11-16.json](owner-wording-2026-11-16.json) and the readable review record.

Runtime `approvalRef` points to the immutable readable record at commit `a3560c8838d2c5d574427f0bf59a0bd2407fdd68`. Codex transcribed the actual chat feedback; no owner-authored GitHub approval comment was created or impersonated. Independent QA must assess this provenance. This does not declare Claude finding B independently closed or authorize a merge/deployment.

| Entry | Previous version | Selected version |
|---|---|---|
| KP-REC-01 | 0.3 | 0.4 |
| KP-REC-02 through 07 | 0.1 | 0.2 |
| KP-REC-08 — who submits/confirms the AIA application | new | 0.1 |

All 24 answers stay within the existing 90-word guard. Wording is byte-matched against the review snapshot in tests. Owner spelling and the selected “Financial Entrepreneur Preview” wording in KP-REC-06 are preserved; this is not a global program rename.

The owner review date is 16 November in Asia/Manila. Runtime approval/effective dates use 15 November UTC, following the existing UTC-calendar-day guard. The guard is unchanged. Superseded versions stop serving after 14 November UTC; they remain available for historical evaluation dates and citation/version traceability. KP-REC-02 retains its original 13 December review deadline; the other selected versions use 14 December. There is no overlap in currently served versions.

## Behavior

The submission clarification is now a separate, narrowly matched FAQ, served only through the recruitment domain. Credential/document/safety handling still takes precedence. Intern and RA queries do not get the AIA-advisor submission answer. The response is informational: it performs no submission, confirmation or new external request.

Registration links, consent/STOP, personal status/OTP, paid learning gates, database schema and application security are unchanged. Internal provenance citations continue to render as plain text rather than visitor links. Existing paid-course availability labels elsewhere are unchanged by the selected FAQ wording.

## Validation

All checks used local synthetic data; nothing was deployed. The engineering automation remains paused.

- PASS: full Vitest suite, 443 tests across 40 files (216.70 seconds); no failures or skipped tests. Single worker, 30-second hook/test timeouts.
- PASS: focused wording/engine/credential/import suite, 197 tests across four files.
- PASS: lint, plain TypeScript validation, and `npm run build:gia:offline` production build.
- PASS: Playwright, 16 tests, including the exact new FAQ in English, Cebuano and Tagalog, visitor access guards and the complete synthetic Command Center journey.
- SKIPPED: one Playwright default-disabled-pilot check because this browser run explicitly enabled the pilot.
- NOT RUN: Cloudflare build on this wording branch. Browser execution had no host restriction in this environment.
- Independent SPIKEDEV second-check and Claude exact-head Q1 remain pending for this draft. These local results are engineering validation, not independent QA.

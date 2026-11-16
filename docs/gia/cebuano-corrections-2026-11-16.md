# PR #22: owner-approved Cebuano corrections

Parent: `cb03e8eb109b8731e5ee63ac94d8d94f112d6b7b`.

The owner explicitly requested only these corrections in the Codex conversation on 16 November 2026:

- KP-REC-01 Cebuano: capitalize the first letter.
- KP-REC-06 Cebuano: `agan` → `agianan`.
- KP-REC-08 Cebuano: `DIli` → `Dili`, remove the double space, lowercase mid-sentence `Leader` / `Application`, and `og` → `ug`.

No other answer wording, versions, routing, approval dates, dependencies or configuration changed. All 24 answers byte-match across runtime, JSON and Markdown. The existing immutable approval reference records the original review; this follow-up records the subsequent explicit correction instruction, transcribed by Codex rather than an owner-authored GitHub comment.

Updated id/version/answers JSON SHA-256:
`2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad`.

## Validation

Final source was frozen before validation. Synthetic local data only.

- PASS: full Vitest suite, 444 tests / 40 files, 197.25 seconds. No failed or skipped unit tests. Command: `SKIP_AUTO_SHIP=1 AUTO_SHIP=0 npx vitest run --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 --testTimeout=30000`.
- PASS: lint (`npm run lint`) and plain TypeScript (`npx tsc --noEmit`).
- PASS: the Next.js production compilation, type/lint checks, static page generation and optimization within `build:cf`.
- FAILURE: `npm run build:cf` exited 1 during OpenNext server packaging: unresolved `sharp-*-*.node` / `sharp-wasm32-*.node` requires and no `.node` loader for `@img/sharp-linux-x64` / `@img/sharp-linuxmusl-x64`. The build used the existing `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` fixture. No dependency/configuration workaround was added to this wording-only change.
- PASS: full Playwright suite, 16 passed in 1.8 minutes, including exact application FAQ responses in all three languages and the synthetic Command Center journey. Command: `GIA_PILOT_ENABLED=true SKIP_AUTO_SHIP=1 AUTO_SHIP=0 npx playwright test --timeout=90000`.
- SKIPPED: one default-disabled-pilot check because the browser run explicitly enabled the pilot.

These are engineering validation results, not independent SPIKEDEV/Claude approval. Nothing was merged, deployed or applied to a live database. The Cloudflare packaging gate remains failed and is not represented as PASS.

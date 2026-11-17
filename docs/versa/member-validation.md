# Draft implementation validation — 17 November 2026

These are Codex implementation checks, not independent QA. SPIKEDEV second-check,
Claude exact-head Q1 and ChatGPT Rule 9 remain required. Nothing was deployed.
All commands used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` and synthetic data only.

| Gate | Evidence |
| --- | --- |
| Lint | `npm run lint`: PASS |
| Plain TypeScript | `npx tsc --noEmit`: PASS |
| Full Vitest | Clean final `npm test -- --maxWorkers=1 --no-file-parallelism`: **49 files / 796 tests PASS**, no failures or skips |
| Cloudflare build | `npm run build:cf`: PASS; handler gzip level 9, deterministic timestamp: **1,199,157 bytes**, below 3 MiB |
| Full production-build Playwright | `MEMBER_LOCAL_DEMO=true GIA_PILOT_ENABLED=true npx playwright test --timeout=90000`: **52 PASS, 1 expected skip**; all 7 new onboarding tests PASS |
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

Protected artifacts are byte-identical to parent #26 at `7ec1c56`:
the knowledge pack, credential-safety module, owner-wording JSON/Markdown and
approved public landing images. Recomputed answer fingerprints:

- All nine entries: `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438`.
- Original eight: `2eb9c08554ae260cbbeeec92f5ede4089b6a8c1f9a859ca936ac7a40097a10ad`.

See [test matrix](member-test-matrix.md), [contract and dependencies](member-onboarding.md),
and [screenshots](../screenshots/versa-members/README.md).

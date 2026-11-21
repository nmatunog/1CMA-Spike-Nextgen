# Codex validation — finish #30

Continuation of existing draft branch `codex/versa-get-staging` at `06a8782a`;
base `e481764e393e6839440160943b1a2980a48f4818`. Exact published head is recorded
on #30's handoff comment. This is implementation evidence, not independent QA.

All commands used `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` and synthetic fixtures only.
The browser harness uses disposable loopback PostgreSQL 18.6 and the actual
restricted member_runtime login. No hosted DB or infrastructure was touched.

| Gate | Result |
| --- | --- |
| lint | PASS |
| plain tsc --noEmit | PASS |
| full serial Vitest | PASS, 826 tests / 53 files (serial, --testTimeout=60000) |
| build:gia:offline | PASS |
| final build:cf | PASS; handler raw 5,022,840 bytes, gzip-9 1,189,558 bytes (< 3 MiB) |
| new GET browser battery | 4 PASS; full flow at 390/768/1440 and invalid input recovery |
| fresh full Playwright | PASS, 57 passed / 1 expected disabled-pilot skip; all four GET cases actually ran |
| separate disabled-pilot Playwright | 1 PASS |
| owner answers fingerprint | `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438`, unchanged |

The new browser cases check all six values and query stripping; collapsed/read-only
Versa details; HttpOnly context; GET and refresh causing no account, credential,
code-claim, handoff-claim, handoff or pending writes; fixed email; password show/hide;
password-first signup; synthetic verification; actual member session; GIA answer
without technical labels; returning signin; reset and replay rejection; malformed,
missing, duplicate, oversized and non-synthetic values; escaping and responsive
layout. The existing account and signed-handoff tests are retained. The checkpoint missed
one crisis browser assertion that still required a visible KP label. The final
test retains the urgent reason/internal citation assertion, checks the actual
safety answer is visible, and asserts the label is absent. Safety runtime and
approved wording are unchanged; the full suite is rerun after this correction.

Route unit tests additionally prove the missing flag fails closed, hosted preview
POST cannot call member storage even with the staging flag, origin/identity
parameter tampering is rejected, password minimum is enforced before writes, and
only an explicit local POST reaches the existing signed-ticket/signup sequence.
An early targeted run caught NextRequest normalizing loopback URLs; the final
route compares the configured member origin and all route cases pass. An earlier
full run was stopped while correcting that defect; only the final completed run
is reported as PASS. The final CF build supersedes the earlier intermediate build.
The first completed full unit run had 825 passes and one timeout in the retained
78-case GIA evaluator (default 5 seconds), plus worker RPC timeout errors while
building concurrently. Its failures are not recorded as a PASS. The final serial
rerun uses --testTimeout=60000 with no concurrent build; no test source or pass bar
was weakened.

Screenshots from actual Chromium runs:

| Width | Welcome | Password | GIA after verified signin |
| --- | --- | --- | --- |
| 390 | [welcome](screenshots/versa-get/welcome-390.png) | [password](screenshots/versa-get/password-390.png) | [GIA](screenshots/versa-get/gia-390.png) |
| 768 | [welcome](screenshots/versa-get/welcome-768.png) | [password](screenshots/versa-get/password-768.png) | [GIA](screenshots/versa-get/gia-768.png) |
| 1440 | [welcome](screenshots/versa-get/welcome-1440.png) | [password](screenshots/versa-get/password-1440.png) | [GIA](screenshots/versa-get/gia-1440.png) |

No knowledge answer, internal citation data, proof, service, auth, verifier,
runtime fail-closed rule, DB configuration or migration was changed. The label
presentation correction from the checkpoint is retained for full and embedded
chat. The test harness alone opts into the new GET flag locally.

Hosted GET preview requires the explicit staging flag and a reviewed release.
Hosted password/verification remain unavailable (503); the synthetic fixture
bridge is loopback-only. Member DB/identity setup, real mail, Access tester
configuration and any deployment remain separate approved work. No live signup,
email delivery, merge, mark-ready or deployment is claimed. Next review sequence:
SPIKEDEV functional QA → Claude Q1 → ChatGPT Rule 9, all at the exact published SHA.

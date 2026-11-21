# Codex validation: format-agnostic preview capture

Base `1650192c042f387b030e5279e65db43fea49f0e9`; new draft branch
`codex/versa-preview-capture`. This is implementation evidence, not independent
SPIKEDEV QA, Claude Q1 or ChatGPT Rule 9. Exact pushed head is on the draft PR.

All commands use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`. Only fictional names and reserved
example/test domains were used. No production or hosted data/configuration changed.

| Check | Result |
| --- | --- |
| Lint / plain tsc | PASS |
| Full serial Vitest | 835 tests / 54 files PASS; --testTimeout=60000 |
| Final focused parser/root/middleware units | 16 tests / 3 files PASS |
| build:gia:offline | PASS |
| build:cf | PASS; handler raw 5,035,409 bytes, gzip-9 **1,198,586 bytes**, under 3 MiB |
| Dedicated no-DB preview Playwright | **3 PASS**, both entry URLs and malformed direct link |
| Standard member/GIA Playwright | 57 PASS / 4 mode-specific skips (3 capture-only + 1 disabled pilot), all run separately |
| Disabled-pilot Playwright, separate server | **1 PASS** |
| Owner answers fingerprint | Unchanged: `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438` |

Direct-page capture internally reuses the existing root receiver rather than
implementing a second cookie encoder. Middleware unit tests verify that rewrite
and its gate/fallback behaviour; root units verify Secure/HttpOnly/SameSite/900s
cookie attributes, 303, no-store, no-referrer and no account-service call. Console
spies cover root and middleware. Arbitrary email/code examples, all structural
checks, length limits and unsafe character checks are retained/tested.
The final rewrite-specific 16-case subset was rerun after the middleware was
changed to delegate to the root handler; other unit sources were unchanged.

The dedicated browser server runs with **DATABASE_URL and MEMBER_DATABASE_URL
unset, MEMBER_ONBOARDING_ENABLED=false**, the existing local preview flags and
GIA_PILOT_ENABLED=true. Tests actually ran, not skipped. They verify:

- `/` and direct `/spike-preview?...` accept `dennis@hismail.example` with
  `12345678` and `NBM-12345`, then show a query-free welcome.
- Name/email/sponsor/code are read-only or display-only; signup username is fixed,
  both passwords start empty, and signin prefills the captured email.
- Submit responds 503 and shows the existing not-connected message. No account,
  credential, mail or code adapter can be reached in this no-service fixture.
- Back navigation goes to clean addresses. A malformed combined sln/sfn query
  clears stale context, shows the plain landing page and leaves signup unfilled.
- Browser console and actual local server stdout contain neither captured email
  nor code. A missing service is not presented as successful signup or delivery.

A first run found the test's alert selector also matched Next's route announcer.
It was narrowed to the main page's existing alert; all three cases then passed.
No application UI/submit logic was changed to make that assertion pass.

The standard regression harness separately uses disposable loopback PostgreSQL
18.6 and existing synthetic member fixtures. It is distinct from the new no-DB
preview tests. The three no-DB-only tests are deliberately skipped in this member
mode and run explicitly on the dedicated server. The disabled-pilot case is also
run separately with pilot off, accounting for every mode-specific check.

Reproduce the dedicated no-DB server (after the existing locked install/build):

```sh
env -u DATABASE_URL -u MEMBER_DATABASE_URL \
SKIP_AUTO_SHIP=1 AUTO_SHIP=0 VERSA_GET_STAGING_ENABLED=true \
MEMBER_LOCAL_DEMO=true MEMBER_ONBOARDING_ENABLED=false \
MEMBER_PUBLIC_ORIGIN=http://127.0.0.1:3004 GIA_PILOT_ENABLED=true \
node node_modules/next/dist/bin/next start -p 3004 -H 127.0.0.1
```

```sh
SKIP_AUTO_SHIP=1 AUTO_SHIP=0 VERSA_CAPTURE_ONLY=true \
GIA_PILOT_ENABLED=true GIA_TEST_URL=http://127.0.0.1:3004 \
npx playwright test tests/gia/versa-capture.spec.ts --timeout=90000
```

For the server-stdout assertion, redirect that server to a local ignored log file
and pass its absolute path as CAPTURE_SERVER_LOG to the test command.
No live DB/migration, KV, analytics, mail service, Access, Worker config, deploy,
merge or mark-ready action was performed. Hosted member submission still fails
closed. Knowledge text/metadata, auth, proofs and signed handoffs are unchanged.

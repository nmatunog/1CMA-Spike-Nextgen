# Versa six-field synthetic staging journey — PR #30

Continue the existing `codex/versa-get-staging` checkpoint `06a8782a`, based on
`mvp01/staging-cf @ e481764e393e6839440160943b1a2980a48f4818`.
Source: [SPIKEDEV brief 6996767943](https://github.com/nmatunog/NEXO/issues/32#issuecomment-6996767943)
and superseding [night work order](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/30#issuecomment-6984600644).
No new PR, migration, database configuration, or release is part of this work.

## GET compatibility and trust

The exact lowercase fields are `mfn`, `mln`, `me`, `sfn`, `sln`, `code`.
A fictional example (not a deployed-use claim):

```text
/?mfn=Test&mln=Member&me=test.member%40example.test&sfn=Test&sln=Sponsor&code=FREE-SYN00032
```

Receiver requires `VERSA_GET_STAGING_ENABLED=true`; unset is disabled. It accepts
only `nextgen-staging.nmatunog.workers.dev`, or loopback with the existing explicit
MEMBER_LOCAL_DEMO flag. Only example.test addresses and FREE-/PRO-SYN plus five
digits are accepted. Names are capped at 80 characters, email at 120, code at 32;
missing, duplicate, unknown/case-mismatched keys, controls and malformed Unicode
are rejected. The synthetic format check is not the authoritative code verifier.

GET stores unverified display context in a separate 15-minute HttpOnly,
SameSite=Lax cookie, clears any stale handoff draft cookie, and redirects to a
query-free /spike-preview. It never calls member storage, creates an account,
verifies an email, sets authoritative sponsor attribution, checks/redeems a code,
or grants an entitlement. Refresh only displays the context. All rendered values
use React escaping. Arrival responses use no-store and no-referrer. No application
logging of raw fields/code is added. The initial query can still reach upstream
Access/edge/browser logs: this remains a fictional-data-only test limitation.

## Password-first local functional flow

Welcome uses the existing GIA portrait/SPIKE layout, Learn. Build. Grow., collapsed
read-only Versa details, and Let's get started. That opens /signup with the fixed
Versa email username, password/confirmation, show/hide, eight-character minimum,
and Create account & meet GIA. No duplicate identity form or immediate-chat bypass.

An explicit password POST to /api/member/preview-signup can bridge the display
context into the **existing signed ticket and member-service path only in local
synthetic demo mode on loopback**. The POST checks the configured member origin,
uses only the server cookie for identity fields, rejects extra body keys, validates
the password, rate-limits, and issues/consumes an existing single-use signed ticket.
It then calls existing signup. This is a local fixture adapter, not a new trusted
Versa issuer, hosted integration, or a way to promote GET data to verified identity.
No ticket, password or proof is returned in JSON or a URL. Email verification and
the existing code check/proof-gated account binding still have to succeed.

The existing synthetic mail sink prepares the verification link. UI explicitly
says no email was sent. Verification rotates the handoff; signing in after that
uses the existing credential/account/code checks. Only successful authentication
then routes this compatibility journey into GIA. Returning sign-in and the existing
single-use expiring reset continue to work; ordinary signed-handoff journeys keep
their account-page destination. Sponsor details remain on signup, not account,
verification or reset pages. No underlying proof/auth/verifier schema is changed.

Full and embedded chat preserve approved answers/internal citation metadata but
render only readable Source links, never KP ids/version labels. The owner wording
fingerprint remains `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438`.

## Local reproduction and hosted holds

Use [the existing disposable PostgreSQL harness](versa/hosted-hardening.md).
`tests/gia/member-demo-server.mjs` explicitly enables the GET flag for that local
synthetic harness only. All gates use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`.
Playwright uses MEMBER_LOCAL_DEMO=true, GIA_PILOT_ENABLED=true and the fixture
GIA_TEST_DATABASE_URL. New tests cover all six values, query stripping, HttpOnly
cookie, GET/refresh with zero account/code/pending/claim side effects, bad inputs,
escaping, password setup, verification, actual member session, GIA, returning login,
reset replay and hidden KP labels. Screenshots live in docs/screenshots/versa-get/
at 390, 768 and 1440 pixels.

**Hosted account setup remains 503.** Even with the display flag enabled on the
staging hostname, the local fixture POST rejects hosted use before member storage.
The existing memberService remains local-only and fail-closed. Hosted password
setup, member DB/identity wiring and a real mail provider need separately approved
implementation/provisioning; this draft does not pretend they work or activate
them. No database migration/configuration/key/role provisioning or real mail is
included. Cloudflare Access tester configuration is unchanged and not certified by
local tests. Hosted six-field preview release, DB/mail setup and deployment each
still need their required reviews and Nilo's explicit approval. No merge,
mark-ready or deploy is authorized here. Next: SPIKEDEV functional QA, Claude Q1,
ChatGPT Rule 9 at the published exact head.

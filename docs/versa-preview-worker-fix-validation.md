# Codex evidence: #31 Worker fix + staging addendum 2

Previous blocked head: `dc02cd097524bbe6a309f4f4ea583b5955fc468e`.
New exact frozen head is recorded on #31. These are Codex implementation checks,
not independent SPIKEDEV QA, Claude Q1 or ChatGPT Rule 9.

All commands used SKIP_AUTO_SHIP=1 AUTO_SHIP=0 and synthetic fixtures only.

| Gate | Result |
| --- | --- |
| lint / plain tsc --noEmit | PASS |
| Full serial Vitest (--testTimeout=60000) | **849 passed / 55 files** |
| Focused service/request/flag/receiver units | **106 passed / 6 files** |
| build:gia:offline | PASS |
| build:cf | PASS; handler raw 5,037,933 bytes; gzip-9 **1,193,857 bytes** (< 3 MiB) |
| Actual CF artifact in local wrangler dev/workerd | **21 smoke groups PASS** |
| Standard Playwright, skip flag off, GIA pilot on | **57 passed / 7 mode-specific skips** |
| No-DB capture/reset-unavailable browser mode | **4 passed** |
| Staging skip on, actual restricted PostgreSQL login | **2 passed** (preview + signed signup) |
| Disabled-pilot mode | **1 passed** |
| Approved answers fingerprint | Unchanged: `57e93bcc170136313767b2ad07a80e3908fb9b2269bf951b4aada365983a4438` |

All 64 browser cases are accounted for across the four explicit modes. Each
member-mode server uses an isolated disposable PostgreSQL 18.6 fixture, never a
hosted database. The no-DB server has both DB URLs unset, onboarding disabled,
and the staging skip flag explicitly enabled for its unavailable-state checks.
The standard suite uses the flag off, retaining the verify-first/reset flows.

## Worker-specific regression

Before the corrected artifact was built, the smoke script ran against the prior
build:cf output and failed with `AssertionError: redirect loop`. It therefore
reproduces HIGH-1 outside next start/Playwright. After correction, the real
workerd process passes all 21 groups. The script has no database binding and uses
only local 127.0.0.1 transport with synthetic Host headers, not the deployed site.

The groups include ordinary fbclid/utm_source/lang queries at both / and
/spike-preview on staging and non-preview hosts, bounded redirects, no cookie
changes for ordinary/non-preview requests, valid six-field capture plus tracking,
malformed clean 303 with expired cookies and plain landing, hosted submit 503,
staging reset-unavailable response and no captured fixture values in logs.
The local HTTP public-origin setting matches that local transport; hosted HTTPS
cookie flags remain covered by the existing receiver units.

The harness initially expected cookie deletion to use Max-Age=0. Next's delete
API uses an expired date instead; the final check asserts empty values for both
cookies and an expiry in 1970. A local HTTP/HTTPS origin mismatch in an additional
reset probe was corrected in the harness configuration, without weakening any
application Origin check. The final artifact smoke run passes. Wrangler's optional
Request.cf metadata fetch can warn and use a placeholder locally; this is not a
product test failure and does not require contacting the real staging app.

CI now builds build:cf and runs this same local Worker smoke, in addition to its
existing checks, with auto-ship disabled. No deploy command or Cloudflare resource
provisioning is part of that job.

## Staging policy checks

Real service tests with the flag enabled on the exact staging host or explicitly
opted-in localhost show an active canonical account, verified credential state,
zero mail sink entries, successful later signin and no entitlement grants. Flag
off, unrelated/pilot/production hosts, and localhost without local-demo opt-in
all retain verification first. Invalid codes still fail with no account/credential
and no mail. Existing verification/reset and raw-SQL proof regressions remain.

Actual browser tests run both the preview and signed signup paths against the
restricted member_runtime login. Before any email interaction they assert the
account is active and candidate/credential verification fields are set; mail rows
are zero. Signup goes to Sign in and successful authentication gives the existing
member session. Forgot password displays the exact staging-unavailable text and
still produces zero mail. A separate no-DB browser and stage-host API unit prove
that message is available even while member storage is disabled.

No migration or DB grant, proof/nonce/HMAC function, credential matching, auth.ts,
verifier, runtime hosted gate, owner wording or Worker configuration changed.
The email bypass is a new, explicit default-off staging policy in service/request
code; it does not override account/code proofs or enable hosted member storage.
No live DB/config/Access/credential action, real email, merge, ready-for-review or
deployment occurred. Source must remain frozen for the new independent reviews.

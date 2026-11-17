# Versa handoff and member onboarding — synthetic draft

Owner sources: [brief 6943631448](https://github.com/nmatunog/NEXO/issues/32#issuecomment-6943631448) and [superseding decisions 6944359204](https://github.com/nmatunog/NEXO/issues/32#issuecomment-6944359204), 17 November 2026. This is a stacked draft on #26 at `7ec1c56e36028fe3952099a3c70af8ed33f3a093`; #26 itself is not updated.

## Reuse and boundaries

UI reference: owner-provided `spike-auth-mockups.zip`, SHA-256
`132bc11f9e75e23b6a254158e902ce2231432b67c097fbec1216e98df3e543ca`.
The signup, signup-done and signin HTML/CSS are the visual reference; fixture identities
are replaced with fictional `example.test` identities. No-delivery copy follows the
superseding owner decision. A replacement email link also works in an already-open
verification tab; its fragment is consumed and immediately removed again.

- Auth.js credentials/JWT sessions remain the authentication shell. `member:<canonical account UUID>` is distinct from `staff:<email>`; existing server staff authorization continues requiring the latter plus the configured roster. Member JWTs are rejected after logout/password reset/change via a stored version check.
- Canonical `candidates` and `user_accounts` and the existing `provisionUserAccount` are reused **only after** email ownership and password sign-in succeed. Temporary pending signup hashes are not active accounts and cannot authenticate. No new CRM, program enrollment, program role, marketing consent or AIA registration is created. Existing verified candidate names/assignment/STOP/consent are preserved.
- SPIKE's portable code verifier is copied byte-for-byte from `nmatunog/SPIKE` at `482c31ced71096a9edc1d732af58bffcee4f0c6f`, `functions/_shared/versaCode/`, into `lib/vendor/versa-code/`. Its existing `verify()` is called read-only, with the existing imported-plan, identity, status, expiry and level logic. `redeem()` is never called. A non-granting adapter prevents entitlement writes. No new verifier HTTP endpoint is invented. Only a `valid` available-code result confirms a handoff; free-entry/already-granted bypasses do not confirm a new handoff.
- The local demo uses the upstream in-memory admin fixture adapter with designated synthetic FREE/PRO inventory. Real authoritative inventory/service connection is an **open dependency**. Existing SPIKE L1/L2 entry checks/redemption remain in SPIKE and are untouched. The handoff claim neither consumes their code nor grants access/payment/eligibility.
- Separate SPIKE Internship / RA-SPIKE Supabase auth and learner IDs are not migrated or implicitly linked. An approved provider/identity mapping is required before real cross-portal account reuse. No separate production identity silo is enabled by this draft.

## Incoming contract

`GET /?mfn=...&mln=...&me=...&sfn=...&sln=...&code=...`

| Lowercase key | Meaning | Bound |
| --- | --- | --- |
| `mfn`, `mln` | Member first/last name | each 1–80 code units |
| `me` | Member email and SPIKE username | valid email, ≤254, normalized lowercase |
| `sfn`, `sln` | Sponsor first/last name, not verified AIA recruiter attribution | each 1–80 |
| `code` | SPIKE access code, never AIA recruiter code/member ID | ≤64; existing FREE/PRO format, 8 alphanumerics after prefix |
| extra fields | Opaque variable data, retained server-side; no authority is inferred | ≤20, keys ≤40, values ≤512 |

Field names are case-sensitive. Duplicate keys/case variants, missing core values, controls/bidi overrides, malformed email/code, oversized input and reserved prototype/credential keys are rejected. The whole encoded query is capped at 8192 characters and 26 fields. Blank optional extra values are retained. React text/attribute escaping handles imported display values; no HTML insertion is used. Extra fields are never serialized into pages or reflected into subsequent URLs, roles, payment, recruiter attribution or course policy.

The root GET receiver consumes fields **before** redirecting. The displayed address becomes `/signup`; an existing active or pending member goes to `/signin` with email filled in. Only an opaque, host-only HttpOnly SameSite=Lax cookie identifies the 15-minute server handoff; cookies are Secure on HTTPS (local HTTP is the documented test-only exception). Invalid handoffs use the same clean recovery path. Root visits without handoff fields still redirect temporarily to the approved #26 landing. No GET creates an account, sends mail, verifies/redeems inventory or changes a password.

Initial partner GET data is unavoidably exposed to the partner, first request URL, browser history and potentially infrastructure request logs. Application code does not log it; no-store/no-referrer prevent downstream caching/referrer propagation. **This query contract stays synthetic-only.** Real intake requires a separately reviewed opaque-token handoff and infrastructure logging controls.

## Signup / verification / sign-in

1. `/signup` displays read-only name, email, sponsor and code using the approved auth mockup. Only password + confirm are entered; minimum 8 actual characters, maximum 256 code units. POST identity is read from the server session. Any attempted identity/authority field in a signup POST is rejected.
2. “Create my account” stages a salted scrypt hash in a 30-minute pending signup and prepares a 10-minute single-use email challenge. No canonical account/contact is linked or activated at this step. Duplicate email never overwrites an existing or pending password.
3. `/signup-done` says “Check your email”. The mockup's delivery claim is deliberately replaced with **“No email was sent. Open the link in the local test mailbox, then sign in.”** This follows the owner's no-live-email decision.
4. The mail link carries only a random fragment token. Its page strips that fragment before the user confirms via POST. Email proof rotates the handoff cookie and invalidates the original one. Verification alone does not activate an account: the email holder must then sign in with the staged password in that proof-bearing browser. This prevents an attacker who pre-registered another email with a known password from signing in after the email holder clicks a link.
5. On the first valid proof + password sign-in, the real verifier is checked against synthetic imported inventory; canonical account creation, credential binding and local handoff claim commit in one transaction. Email/claim uniqueness and row/advisory locks prevent racing duplicates. No course entitlement is written. The original requester cannot reuse the pre-verification cookie. Existing members sign in and explicitly link only a matching, email-verified handoff; their passwords remain unchanged.
6. `/signin` is the subsequent entry. Forgot-password responses are generic. Reset links are random, 15-minute, single-use; reset and authenticated password change invalidate old sessions. Pending signup recovery can replace an attacker-chosen pending password using email proof, but still needs a valid handoff/code before activation. Logout invalidates member sessions and clears the handoff cookie.

Verification/reset challenges store HMAC digests. The local synthetic mail sink necessarily holds the synthetic link; it has no HTTP retrieval endpoint and is denied to public/GIA DB roles. Handshake and rate-window expiry is pruned on arrivals; pending intents expire after 30 minutes; local sink messages are pruned after one hour. Verification is not marketing consent. Sponsor names are stored separately as unverified data and never replace trusted AIA recruiter configuration.

## Run locally (no real email or hosted DB)

All commands use `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`.

1. Install existing locked dependencies and build with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/tests/gia/font-mock.cjs" npm run build:cf`.
2. `node tests/gia/member-demo-server.mjs` starts an ephemeral synthetic PGlite DB on loopback and the app at `http://127.0.0.1:3002`. This explicitly enables the local-only member adapters and generates temporary secrets. It never contacts Supabase, a real mailbox, a verifier endpoint, or a deployment service.
3. Open this designated synthetic-only sample:

`http://127.0.0.1:3002/?mfn=Demo&mln=Member&me=demo%40example.test&sfn=Test&sln=Sponsor&code=FREE-SYN00001&campaign=synthetic-demo`

The sample works **only in the local harness**; no deployed integration is asserted. FREE/PRO `SYN00001` and `SYN00006`–`SYN00040` are available test inventory; `SYN00002` expired, `00003` reused, `00004` revoked, `00005` another identity; unlisted `00099` unknown. These are fictional test codes, never production credentials. The runtime rejects non-`@example.test` recipients and non-synthetic codes.

4. Read `member_local_mail` directly from the local DB for test links; there is deliberately no public mail/debug endpoint. Playwright does this only on `127.0.0.1:55432`.
5. `MEMBER_LOCAL_DEMO=true GIA_PILOT_ENABLED=true npx playwright test --timeout=90000` exercises the full browser suite. Unit tests inject an isolated PGlite store and the same pinned verifier.

## Open dependencies / release hold

- Real mail provider and approval: pluggable `MemberMailer.send` exists; only the local synthetic sink is supplied. No delivery to a real address is implemented or claimed.
- Reviewed authoritative verifier/storage adapter and identity mapping to existing program accounts. No guessed remote URL, CSV import to a live store, or real code is used.
- Physical member identity storage placement remains a reviewed architecture/deployment decision. `0012_member_onboarding.sql` is additive **draft schema**, applied only to ephemeral local test DBs. It grants no new access to `gia_app` or public roles. A separate least-privilege server identity/grant review is required before enabling hosted member storage.
- The runtime defaults off. Even when the feature flag is set, the supplied adapter requires explicit local-demo mode, loopback DB + HTTP origin, real-length non-placeholder server secrets and synthetic inputs. It fails closed on hosted configurations.
- GIA's separately reported 007/recruiter-name over-refusal remains a real-intake review dependency. This PR does not change credential safety or approved GIA answers.
- SPIKEDEV second-check → Claude independent exact-head Q1 → ChatGPT Rule 9 → Nilo's separate merge/deploy decision. No live email, DB, Access policy, merge or deployment is included.

## Cloudflare Access plan — no policy changes

Before inviting Versa testers, have Nilo review an exact policy diff for the existing protected staging host. Scope the designated tester identities to the complete member journey: exact root and landing, `/signup`, `/signup-done`, `/signin`, verification/reset/account pages, `/api/member*`, required Auth.js CSRF/callback/session/sign-out endpoints and static assets/GIA as separately approved. Do not use a host-wide bypass. Preserve owner/staff-only policy enforcement on `/recruitment/command*`, `/api/recruitment/*` and `/api/admin/*`; test Access path precedence with the actual policy proposal. Application authorization still independently requires the staff namespace/roster. Do not give Versa live links until owner-approved rollout and Access testing; no policy/API write occurs here.

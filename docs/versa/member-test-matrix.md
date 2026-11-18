# Member onboarding test evidence map

| Required case | Evidence |
| --- | --- |
| Arrival/read-only display, exact auth mockups, mobile/desktop and light/dark | `tests/gia/versa-members.spec.ts`: signup/check-email/signin screenshots; four display-only details; only password/confirm editable |
| Invalid, incomplete, duplicate/case-variant parameters, limits, escaped HTML | `lib/member/service.test.ts` contract cases + real root/API browser tests |
| Immutable identity / POST tampering / CSRF / body limits | `lib/member/http.test.ts` + browser tampering/cross-site tests |
| Valid FREE and PRO confirm only the handoff | service activation cases + real PRO browser journey; no enrollment or roles |
| Invalid/unknown, expired, reused, revoked and wrong-owner codes | pinned verifier service tests + browser sign-in denial; no canonical account activation |
| Refresh/replay, rotating email proof, duplicate email and races | service tests + browser existing-account flow; no password overwrite |
| Email ownership before activation, pre-registration attack and pending recovery | service proof-rotation and pending-password recovery cases; signup→mail→signin browser flow |
| Password setup, later email/password sign-in | service policy and lifecycle + browser lifecycle |
| Forgot/reset generic response, expiry and single-use / concurrent reuse | HTTP generic-response tests + service expiry/races + browser expired/replayed links |
| Authenticated password change and session invalidation | service cases + browser old JWT replay after logout/reset and password change |
| Sign-out and expired handoff | service expiry/logout + browser sign-out |
| Sponsor / variable-data preservation; no recruiter-credit substitution | service claims checks + browser persisted metadata and sponsor display |
| Staff isolation | unchanged staff namespace gate + HTTP wrong-namespace tests + real member requests denied by Command Center/admin APIs |
| Mail delivery unavailable | signed issuer tampering/nonce replay/expiry/single-use, format injection and role/RLS tests in `service.test.ts`; local-only sink; UI explicitly says no email sent; HTTP provider-failure response test |
| Existing landing, GIA STOP/crisis/consent and attribution | complete existing Playwright and Vitest suites retained |

Gate counts, exact SHA, screenshots and handler gzip size are recorded in the draft PR. These are implementation checks, not SPIKEDEV/Claude independent QA. All fixtures use fictional `@example.test` identities and designated `SYN` codes; no real credentials or personal reference links.

Rule 9 follow-up adds authenticated-body and sponsor tampering, stale timestamps,
duplicate JSON, nonce replay, ticket expiry/parallel consumption, per-handoff
squatting prevention, generic existing/unknown arrivals, configurable code parsing,
and actual activation under the dedicated `member_app` role. Mail links, canonical
candidate names and program-role writes are denied to that role; member tables are
also denied to `gia_app`, `anon` and `authenticated`.

Historical M1 at 4b70c49: `lib/member/account-rls.test.ts` ran 12 real PGlite role probes with FORCE RLS.
No-scope SELECT returns no rows; scoped SELECT returns only the owned row. A disabled
row cannot become active, an active INSERT is rejected, out-of-scope rows cannot be
updated, and DELETE/reassignment are denied. A pending own-row insert/activation
succeeds. Candidate reads expose only the current verified email. Service/browser
lifecycles prove the narrower policy still supports normal signup and account use.

LOW-1/LOW-2: the account role suite now has 20 SQL probes. Direct INSERT/UPDATE fail
with permission denied even after scope tampering. Definer functions enforce verified
candidate/email matching, pending-only creation and exact pending→active activation;
active/disabled conflicts, wrong candidate ids and unverified candidates are refused.
Credential/challenge reads return zero rows without scope, and scoped reads expose
only that identity. Exact token/kind lookup, fixed search_path/owner, private function
ACLs and denied gia_app/anon/authenticated access are tested. A local restricted
LOGIN fixture proves RESET ROLE gains no account-write privilege under the required
hosted login model. Three service regressions prove canonical pending/active/disabled
conflicts return 409 unchanged; all 57 service lifecycle cases pass.

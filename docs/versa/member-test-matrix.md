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
| Mail delivery unavailable | local-only sink; UI explicitly says no email sent; HTTP provider-failure response test |
| Existing landing, GIA STOP/crisis/consent and attribution | complete existing Playwright and Vitest suites retained |

Gate counts, exact SHA, screenshots and handler gzip size are recorded in the draft PR. These are implementation checks, not SPIKEDEV/Claude independent QA. All fixtures use fictional `@example.test` identities and designated `SYN` codes; no real credentials or personal reference links.

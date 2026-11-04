# GIA pilot implementation and QA handoff

Refs #5, #4 and approved NEXO #27. Existing baseline: main at `8f106face940202f47b72c38297f73066af31b27`. Draft PR: https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/6. No merge, production deployment, DNS change or real-data migration was performed.

## Baseline and architecture

The app uses Next.js 15 App Router, React 19, Auth.js credentials/JWT, Drizzle and PostgreSQL. `lib/db/schema.ts` already owns `candidates` and `leads`. Existing `/chat` and candidate signup stay in place. The legacy candidate admin endpoints trusted an unsigned `admin_verified=1` cookie; those endpoints now require authenticated server-side admin authorization. Existing demo logins do not grant recruitment staff access.

GIA adds `/gia`, `/gia/privacy`, `/api/gia`, `/recruitment/command` and `/api/recruitment/command`. The additive SQL migration extends **the existing `candidates` table** and adds source identities, source/purpose consent, FEP sessions/bookings, handoffs, suppression and append-only audit events. No competing CRM or candidate table. Future channel adapters must attach to this same identity/workflow contract, apply global candidate opt-out, and never auto-merge an unverified email/name.

The FAQ engine has no model API, retrieval from private sources, payments, uploads or outgoing messages. Unknown/restricted questions offer escalation; after consent they automatically create an idempotent leader handoff with a structured reason. Raw messages and document contents are never saved or copied to handoffs. Audit events contain only intent, citation/version and workflow metadata. Handoffs include the three approved learning-loop fields; none automatically become approved answers.

## Knowledge approval is still a blocker

The two initial literacy/FEP rows remain **drafts**. Acceptance of the template/test set in NEXO #27 was not approval of individual answers. Only Nilo may approve those rows. The shipping application therefore escalates the literacy question; automated approved-answer checks use clearly marked fixtures only. Do not call the complete twelve-step approved-answer demonstration passed. Once Nilo approves source-backed entries, set their approval identity/date and effective/review dates, review translations, and rerun the full Claude evaluation set. SPIKE fees, licensing documents, eligibility and coding details are not served from drafts or invented.

## Reproduce locally with synthetic data

```bash
npm ci
npm test
npm run build:gia:offline
npm run demo:gia
```

In another terminal:

```bash
GIA_PILOT_ENABLED=true npm run test:gia:browser
```

Open http://127.0.0.1:3002/gia. The demo starts an ephemeral embedded PostgreSQL instance over its local wire protocol, applies the migration, seeds one synthetic Nov 7 FEP at 09:30 Manila with five seats, and starts the built app. It generates random local-only admin and leader accounts; their test login details are in ignored `work/demo-access.json`. Do not commit that file. It creates no remote resources and loses data when stopped. Shut down and restart to reset the demo. Browser tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for another installed browser. A real unmodified build remains `npm run build`; the offline verification script substitutes only the repository's pre-existing Google Font, which this environment cannot fetch.

The pilot API defaults to disabled. The enabled browser run intentionally skips the disabled-mode test; run that test against a separate default `next start` instance with `GIA_TEST_URL` and without `GIA_PILOT_ENABLED` to check that mode.

## Staging configuration and access

Review `migrations/0001_gia_recruitment.sql` against a backup of the staging schema before applying it. No automatic production migration. Existing candidate names/contact/score remain intact. RLS is enabled for candidate and workflow tables; the application needs a server-only PostgreSQL role that can access these tables. Review existing Supabase policies/grants and test with actual `anon`/`authenticated` roles before real data; the local superuser demonstration does not prove hosted RLS configuration.

Configure `DATABASE_URL`, a real random `AUTH_SECRET`, a distinct random `GIA_SESSION_SECRET` of at least 32 characters, `GIA_PUBLIC_ORIGIN` matching the browser's exact scheme/hostname/port, and `GIA_PILOT_ENABLED=true`. Signed HttpOnly/SameSite cookies bind the visitor session; these are **not OTP identity verification**.

`RECRUITMENT_STAFF_ACCOUNTS` maps staff email to `{salt,hash}`. Generate an individual random 16-byte hexadecimal salt and a 64-byte scrypt hash (hex) from each password. Store these server-side in the hosting secret manager. `RECRUITMENT_STAFF_ROLES` separately maps email to `admin` or `leader`. A signed Auth.js session must have the `staff:<email>` identity; the demo user's email, the legacy cookie and a claimed role in chat are insufficient. Admins triage unassigned candidates and assign leaders. Leaders see/update only their assigned candidates and cannot reassign them. All staff writes use an origin check and server-side validation. Stronger operational login protection, reset/revocation and real identity provisioning require staging review.

## Implemented behavior

- English AI disclosure, privacy notice, explicit consent, initial free-learning/FEP/leader actions and requested Bisaya/Tagalog switching.
- Knowledge approval/audience/date/conflict gates; source/version citation when an approved entry exists; conservative escalation for compound/off-script queries.
- Transactional contact consent, FEP capacity checks, idempotent retry handling and successful-save references. Failure never becomes a confirmation. No email confirmation service is claimed.
- One canonical candidate identity per web session. Unverified contacts never auto-merge. Verified cross-channel linking and possible-duplicate human resolution remain future work.
- Incoming handoff queue, admin assignment, leader follow-up/stage updates, resolution and optional general answer. Stored 24-hour due/18-hour escalation timestamps are shown; no background escalation/reminder sender is installed.
- STOP persists, revokes all purposes/sources attached to the canonical candidate, cancels open follow-up and blocks new actions for linked identities. Fresh-browser recovery and suppression across still-unlinked contact identities require verified contact handling before real use. No transcript storage; profile/deletion and indefinite contact suppression procedures still need privacy-owner acceptance.
- `get_my_status` fails closed pending a verified OTP adapter. Never returns personal stage from a web cookie or demo login.

## Validation and limits

Validation on November 4, 2026: **108/108 Vitest tests passed** (five suites); lint/type checking and the Next.js build passed with the offline font fixture. Chromium enabled-pilot run: **4 passed, 1 intentionally skipped** (disabled-mode test). Separate disabled-pilot run: **1 passed**. Browser sizes: 390×844 and 1440×1000. The browser scenario uses real HTTP, signed visitor sessions, the PostgreSQL wire driver, two individual staff logins and database writes; it does not mock the workflow API.

Automated suites cover approved fixture answers, draft/retired/restricted/expired/future/conflicting entries, 60+ distinct FAQ and adversarial cases, explicit language requests, documents, STOP during booking, consent, failed/full/duplicate bookings, repeated and resolved handoffs, immutable audit events, roles, anonymous API denial and forged legacy cookies.

Production repository SQL is exercised against embedded PostgreSQL. Unit SQL tests skip the advisory-lock statement; the local wire-protocol browser demo uses the actual PostgreSQL driver and locking calls. Hosted PostgreSQL multi-connection contention, Supabase policy deployment, crash recovery, email delivery, OTP, real messaging, retention/deletion and the full Claude 78-case business acceptance evaluation are **not certified** by these tests.

Chromium checks run at 390px and 1440px, check horizontal overflow, and exercise visitor consent → unapproved-answer escalation → Bisaya → FEP saved → leader request → individual staff login → assignment/follow-up → leader-only access/update → STOP. Screenshots live in `docs/gia/screenshots/`. No hosted staging preview was provisioned. Independent QA by Claude and Nilo acceptance are required before merge/deployment.

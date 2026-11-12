# GIA pilot implementation and QA handoff

Refs #5, #4 and approved NEXO #27. Existing baseline: main at `8f106face940202f47b72c38297f73066af31b27`. Draft PR: https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/6. No merge, production deployment, DNS change or real-data migration was performed.

## Baseline and architecture

The app uses Next.js 15 App Router, React 19, Auth.js credentials/JWT, Drizzle and PostgreSQL. `lib/db/schema.ts` already owns `candidates` and `leads`. Existing `/chat` and candidate signup stay in place. The legacy candidate admin endpoints trusted an unsigned `admin_verified=1` cookie; those endpoints now require authenticated server-side admin authorization. Existing demo logins do not grant recruitment staff access.

GIA adds `/gia`, `/gia/privacy`, `/api/gia`, `/recruitment/command` and `/api/recruitment/command`. The additive SQL migration extends **the existing `candidates` table** and adds source identities, source/purpose consent, FEP sessions/bookings, handoffs, suppression and append-only audit events. No competing CRM or candidate table. Future channel adapters must attach to this same identity/workflow contract, apply global candidate opt-out, and never auto-merge an unverified email/name.

The FAQ engine has no model API, retrieval from private sources, payments, uploads or outgoing messages. Unknown/restricted questions offer escalation; after consent they automatically create an idempotent leader handoff with a structured reason. Raw messages and document contents are never saved or copied to handoffs. Audit events contain only intent, citation/version and workflow metadata. Handoffs include the three approved learning-loop fields; none automatically become approved answers.

## Knowledge approval recorded

Nilo approved the exact Financial Literacy and FEP answers in this conversation on November 4, 2026. Both are now active at version 0.2, audience public, effective November 4 and due for review December 4. See [the approval record](gia/knowledge-approval-2026-11-04.md) for exact wording, scope and sources. Earlier 0.1 drafts are archived separately. English is the approved source; Bisaya/Tagalog translations preserve its meaning and are served only when requested.

Tests now exercise the actual approved shipping pack, including the browser demonstration. Broader Knowledge Pack coverage and Claude's complete business evaluation remain outstanding. SPIKE fees, licensing documents, eligibility, earnings and refund answers have not been approved by this decision.

## Reproduce locally with synthetic data

```bash
npm ci
npm test
npm run test:gia:eval
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
- STOP persists, revokes all purposes/sources attached to the canonical candidate, cancels open follow-up and blocks new actions for linked identities. GIA `opt_out` still calls the existing repository path; a marked seam waits for C1 `lib/recruitment/suppression`. Fresh-browser recovery and suppression across still-unlinked contact identities require verified contact handling before real use.
- Exactly five GIA tools: `list_fep_sessions`, `book_fep`, `request_leader`, `get_my_status` (OTP required), `opt_out`. FEP changes go through `request_leader` with reason `fep_change` (`cancel_fep` is P1, not implemented). Every tool and chat turn writes an append-only `gia_turns` row.
- `get_my_status` uses a mock/dev OTP adapter only (no paid SMS/email). A web session or demo login is never verification. After a verified OTP it returns only that requester's own stage/booking/handoff references.
- Knowledge Pack import is keyed by `(id, version)` with a 90-word answer limit and required approval fields. `staff_only` entries are never served. KP-LIT-*, KP-FEP-*, and KP-DOCS-* may be approved; intern/RA packs remain drafts.
- Chat uploads are discarded. Documents go only to iRecruit or the person's leader.
- Boundary: GIA never creates codes, never treats payment as verified, never changes entitlements. It may explain L1/L2 only from approved knowledge (none approved yet) and otherwise routes to a leader for RA-SPIKE or SPIKE for Interns.
- Retention config (no destructive jobs): transcripts 24 months after last contact; audit for life of record; suppression indefinite. See [retention](gia/retention.md).

## Validation and limits

Validation on November 4, 2026: **109/109 Vitest tests passed** (five suites); lint/type checking and the Next.js build passed with the offline font fixture. Chromium enabled-pilot run: **4 passed, 1 intentionally skipped** (disabled-mode test). Separate disabled-pilot run: **1 passed**. Browser sizes: 390×844 and 1440×1000. The browser scenario uses real HTTP, signed visitor sessions, the PostgreSQL wire driver, two individual staff logins and database writes; it does not mock the workflow API.

Automated suites cover the real owner-approved answers, draft/retired/restricted/expired/future/conflicting entries, 60+ distinct FAQ and adversarial cases, explicit language requests, documents, STOP during booking, consent, failed/full/duplicate bookings, repeated and resolved handoffs, immutable audit events, roles, anonymous API denial and forged legacy cookies.

Production repository SQL is exercised against embedded PostgreSQL. Unit SQL tests skip the advisory-lock statement; the local wire-protocol browser demo uses the actual PostgreSQL driver and locking calls. Hosted PostgreSQL multi-connection contention, Supabase policy deployment, crash recovery, real messaging, paid OTP delivery and retention deletion jobs are **not certified** by these tests. `npm run test:gia:eval` runs the placeholder harness and the official GIA Test Set v0.3 (`data/gia-eval-set-v0.3.jsonl`).

Chromium checks run at 390px and 1440px, check horizontal overflow, and exercise visitor consent → approved literacy answer and citation → Bisaya → approved FEP answer and citation → FEP saved → leader request → individual staff login → assignment/follow-up → leader-only access/update → STOP. Screenshots live in `docs/gia/screenshots/`. No hosted staging preview was provisioned. Independent QA by Claude and Nilo acceptance are required before merge/deployment.

## G1 next increment — role-aware program adapters (NEXO #32)

GIA is the role-aware guide across **recruit**, **intern**, and **RA**. Each program is an adapter: recruit keeps the five FEP tools; intern/RA expose `get_my_status`, `request_leader`, and `opt_out` only. Program status is read from a swappable `ProgramSource` (`lib/gia/program-source.mjs`). This increment ships the **synthetic** source only. `GIA_PROGRAM_SOURCE` other than `synthetic` is refused. No portal hostname is stored or called. OTP, STOP, and escalation guarantees are unchanged.

Visitor default is recruit **only** when both the request body `program` field and the `gia_program` cookie are absent. An explicit `null`, empty, unknown, non-string, or non-canonical value in the body or cookie returns `invalid_program`. `parseProgram` never string-coerces arrays, numbers, booleans, or objects. Tampered engine context fail-closes to intern (least FEP privilege) instead of recruit. Intern/RA `knowledgeTopics` are empty, so recruit literacy/FEP FAQ and the recruit-only quick-reply buttons are not served on those adapters. The program switcher sends exact lowercase `recruit` / `intern` / `ra`.

No schema migration. C1 is adding `0007` in parallel; this increment does not need `0008`. Program context is a request/cookie attribute, not an entitlement GIA writes.

The official NEXO 78-case list was not in this repository; `tests/gia/eval/cases.json` is a labeled placeholder. Local eval (`npm run test:gia:eval`) runs each case 3× (234 runs) and currently meets the pass bar: must-escalate 100%, STOP 100%, no-OTP status refused 100%, untraceable 0, rest 100% (≥90% required). Program-adapter cases in `tests/gia/eval/program-cases.json` are extra runs on top of EV-001..EV-078.

## G1 MVP 01 — GIA engage (`g1/mvp01-gia-engage`)

GIA is the official AI guide for GIYA Institute — The SPIKE Method, not a recruitment-only bot. MVP 01 (Nov 16–20) welcomes and orients, serves only the owner-approved Financial Literacy and FEP pack, recommends next steps, and hands off to the assigned leader.

Knowledge is split into modular domains under `lib/gia/knowledge/domains/`. Active MVP 01 domains: `recruitment`, `financial-literacy`, `fep`. Stubbed: `interns`, `ra-spike`, `documents`. A role capability map (`lib/gia/capabilities.mjs`) covers prospect, candidate, intern, RA, leader, and admin. Leader/admin never gain Command Center powers in GIA chat.

Engagement events match C1 `docs/mvp01/interfaces.md` @ `eefc126`: `gia.conversation`, `gia.handoff`, `literacy.interest`, `fep.booked`. G1 never emits `fep.attended`. Consented visitor writes go through `recordGiaVisitorEngagement` (not the staff HTTP route). Metadata is C1's `intent`/`citation` string allowlist (≤80, no OTP/code tokens). `engagementPort().list()` requires an identity or candidate scope. `canReadDomain` gates FAQ serving in the engine.

English remains the default. Bisaya/Tagalog switch only on explicit request. Guardrails (each with eval cases): GIA never invents candidate status, never approves recruitment decisions, never issues or redeems paid codes, never bypasses intern/RA/staff permissions, and never gives regulated insurance advice. Extra eval: `tests/gia/eval/mvp01-cases.json`.

## G1 integration follow-on (frozen at c5b25ce / merged on integration/cc02a-gia)

Adds the remaining owner-approved GIA contract on top of PR #6 without replacing it: five tools, mock/dev OTP for `get_my_status`, Knowledge Pack import keyed by `(id, version)`, chat-upload discard, Nov 8 boundary refusals, placeholder EV-001..EV-078 eval harness, and retention config. Command Center paths under `app/recruitment/*` and `app/api/recruitment/*` are untouched. GIA `opt_out` still calls the existing repository STOP path; a marked seam waits for C1 `lib/recruitment/suppression`.

## Unconsented urgent handoffs (admin-only)

Unconsented crisis rows have no assigned leader and no contact details. They appear on the Command Center handoff queue for **admins only**, labeled **Unassigned**. Leaders do not see them (they are not routed to an individual). The panel shows an 8-character visitor hash, never the full session identity. Rate limits use hashed IP buckets in `gia_rate_windows` (IPv6 masked to /64). Defaults: `GIA_RATE_LIMIT_IP_MAX=60` / minute, `GIA_RATE_LIMIT_GLOBAL_MAX=300` / minute, `GIA_URGENT_UNCONSENTED_IP_MAX=3` / hour (`GIA_RATE_LIMIT_IP_WINDOW_MS`, `GIA_RATE_LIMIT_GLOBAL_WINDOW_MS`, `GIA_URGENT_UNCONSENTED_WINDOW_MS`). Crisis replies still serve KP-SAFETY-01 when a limit is hit; only the extra queue row is skipped. No paid limiter.

Owner decisions still open: KP-SAFETY-01 v0.2 mobile hotlines, and unconsented “reach out” wording. Do not change the approved safety text until Nilo approves it.

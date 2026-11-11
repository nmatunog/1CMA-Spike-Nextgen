# Current-state inventory, reuse, and problems

Companion to [`spike-ecosystem-audit.md`](./spike-ecosystem-audit.md). Same A1 audit, 2026-11-11. No hosted DB queries. NEXO #26 issue body not ingested this pass (Issues API 403; attached JSON not on disk). `c1/mvp01-journey` is C1’s in-progress MVP 01 branch (`f8d6e5fe`).

## 1. Current-state inventory

Verified via git, GitHub APIs, Cloudflare GET, and public HTTP. Hosted Supabase row contents were **not** queried. Hosted apply-state of migrations is **unknown**.

### 1.1 Surfaces

| Surface | Host | Project | Last production evidence | SHA |
|---|---|---|---|---|
| SPIKE for Interns | https://portal.1cma.online (also spike-asc.pages.dev) | Cloudflare Pages `spike` | 2026-08-13 ad-hoc; GitHub Actions deploys `main` → Pages `spike` | `2f5e48c` = `origin/main` |
| RA-SPIKE Rookie Academy | https://ra-spike.pages.dev and https://portal.1cma.online/ra-spike/ | Pages `ra-spike` | 2026-08-08 ad-hoc | `5efff0c` (**on `main`**, not git `ra-spike`) |
| RA proxy | `portal.1cma.online/ra-spike*` plus listed content/coach/mentor paths | Worker `portal-ra-spike` | wrangler last modified 2026-07-10 | routes in `workers/portal-ra-spike/wrangler.jsonc` |
| Command Center hostname | command.1cma.online | — | **DNS does not resolve** | Preferred in Nextgen #4; not live |
| GIA hostname | gia.1cma.online | — | **DNS does not resolve** | |
| GIYA public site | https://joingiya.com | Pages `keyman-insurance` | Separate repo | Not the learning portal |
| SPIKE LIFE Pages | spike-life.pages.dev | Pages `spike-life` | last deploy 2026-06-29 | Also embedded in intern portal `/life` |
| District cockpit | (private) | Worker `1cma-command-center-staging` | repo `nmatunog/1cma-command-center` | **Not** recruitment Command Center |

Pages `spike` and `ra-spike` are **not Git-connected** (`source_type: null`). Internship CI: `.github/workflows/deploy-cloudflare-pages.yml` on push to `main`. Git branch `ra-spike` still has an RA deploy workflow; **live RA-SPIKE is not that branch**.

### 1.2 Repositories and working branches (2026-11-11)

| Tree | Stack | Role | Head (this audit) |
|---|---|---|---|
| `nmatunog/SPIKE` `main` | Vite + React 19 + Pages Functions + two Supabase projects | Live intern + RA learning portals | `2f5e48c` |
| `nmatunog/SPIKE` `ra-spike` | Older RA shell | **Stale git line** | `394342d` (2026-07-11); 35 ahead / 85 behind main; merge-base `60cb6a6` |
| `nmatunog/SPIKE` `v1/l1-versa-csv-verification` | Portable Versa CSV gate | Flag off; **not** wired to intern signup | `609c006` |
| `nmatunog/SPIKE` `sec1/f1-activation-codes` | F1 RLS + client SELECT removal | Repo SQL only; do not apply hosted | `67f257c` |
| `nmatunog/1CMA-Spike-Nextgen` `main` | Next.js 15 + Auth.js + Drizzle + Postgres | Older AIA landing + DNA quiz; `spike-next/` static Versa mock | `8f106fa` |
| Nextgen PR #6 `codex/gia-mvp-pilot` | GIA + `/recruitment/command` | Draft, unmerged; Checkpoint 01 defects **still on this SHA** | `8e84fbc` |
| Nextgen `c1/cc-02a-dashboard-queue` | CC-02a | Dashboard/queue/STOP; no PR at audit time | `62d61d7` (earlier) |
| Nextgen `c1/cc-02b-csv` | CC-02b | CSV intake/export | merged into CC-03 line |
| Nextgen `c1/cc-03-evaluate-engage` | Evaluate/engage slice under MVP 01 | Parent of `c1/mvp01-journey` | `d77c3f2` |
| Nextgen **`c1/mvp01-journey`** | **C1 in-progress MVP 01** (Capture→Register→Evaluate→Engage; 0008; G1 interfaces) | Continue here. Do not avoid. | `f8d6e5fe` |
| Nextgen `g1/gia-integration` | GIA OTP/tools | no PR | `c5b25ce` line |
| Nextgen `g1/gia-next-program-adapters` | Role-aware recruit/intern/RA adapters; synthetic program source | no live portal URL | `cb37ab59` (`lib/gia/programs.mjs`) |
| Nextgen `integration/cc02a-gia` | integration line | — | — |

### 1.3 Identity, roles, enrollment (SPIKE today)

DB enum `app_role`: `INTERN`, `FACULTY` (UI: Program Coach), `MENTOR`, `ADMIN`, `SUPERUSER`. Guest panelists are unauthenticated.

Canonical township model is **not implemented**. Today:

```
Supabase Auth user  →  profiles.role (global)  →  intern_progress.program_slug
```

`INTERN` means both “intern cohort member” and “RA rookie”. There is no Candidate record in SPIKE, no Program Enrollment entity, and no Program Role distinct from the global enum.

Program slugs in `src/lib/programs/constants.js`: `spike-internship`, `ra-spike`, **`agency-training`**, **`leader-academy`**. Only the first two have `PROGRAM_REGISTRY` definitions.

| Actor | How they enter | Files |
|---|---|---|
| Intern | Email/password + **daily shared activation code** | `functions/api/auth/intern-signup.js`, `functions/_shared/activationCode.js` |
| RA-SPIKE rookie | Open signup to an open `ra-spike` cohort; invite code optional | `functions/api/ra-spike/signup.js`, `20260812_ra_spike_open_signup_no_code.sql` |
| Staff | Self-signup disabled after first SUPERUSER | `20260815_disable_staff_self_signup.sql` |
| Cross-portal staff | HMAC handoff + `verifyOtp` | `StaffProgramSwitcher.jsx`, `functions/_shared/staffPortalHandoff.js` |
| Cross-portal login hint | email lookup in **both** DBs via service role | `portalAuthHintHandler.js` |

**Two different code systems — do not conflate:**

1. **Daily intern activation codes** — one shared code per Manila day; plaintext; anyone with the code can create an intern account. Live on `main`. See §1.9.
2. **Versa per-learner codes** — HMAC digest inventory, identity-bound, one-time. Only on `v1/l1-versa-csv-verification`, default **off**. See §1.10.

RA-SPIKE Gate 1 (week 4 pitch) / Gate 2 (week 8 revalida) are **in-program progression**, not L1/L2 enrollment gates.

### 1.4 Databases (from repo; hosted apply-state not queried)

| Project ref (in repo) | Used by | Migration tree |
|---|---|---|
| `lzbfjbtjropoaynbcxew` | Internship | `supabase/schema.sql` + **87** files in `supabase/migrations/` |
| `yruwfdjqigxxwbqsqhho` | RA-SPIKE | **43** files in `supabase/ra-spike/migrations/` (forked schema, not a thin slice) |

Core tables (both, with program extras): `profiles`, `intern_progress` (`program_slug`), `cohorts`, `formation_squads*`, curriculum CMS (`segments/weeks/days/content_blocks`), `playbook_completions`, surveys/FNA/timeline, venture blueprint/portfolio, pitch panel (internship), `ra_spike_week_progress`, gate/graduation columns, revalida (`revalida_panel_ratings`, `revalida_panelist_checkins`, `revalida_results_published`), `activation_codes`, SPIKE LIFE rooms.

RLS is widespread. **SECURITY DEFINER** RPCs appear in 70+ migration files. Several are granted to **`anon`**: `resolve_ra_spike_cohort`, `validate_staff_registration_code`, pitch-panel fetch, revalida guest fetch/submit/finalize. Revalida PIN check was disabled (`20260823_revalida_disable_panelist_pin.sql`).

**ASSUMPTION:** hosted DBs match git. README still lists a 22-step manual SQL checklist; later migrations exist beyond that list.

Nextgen recruit DB (PR #6+): additive `candidates` + `candidate_identities`, `candidate_consents`, append-only `candidate_events`, `fep_sessions`/`fep_bookings`, `candidate_handoffs`, `gia_suppressions`. Server role `gia_app`; FORCE RLS on later migrations (0002–0007 on the C1 line). **Not** the SPIKE learner DBs.

### 1.5 Security — F1 and related

**F1 (verified in repo; live DB unknown):** policy `activation_codes_public_read` allows `anon` + `authenticated` to `SELECT` plaintext `code` for any non-expired row (`supabase/activation_codes.sql` lines 21–26; recreated in intern and RA catchup migrations). On `main`, `src/lib/activationCodeService.js` still client-SELECTs today’s code. Server signup uses service role (good) **and** the client path remains (bad).

Fix SQL + client removal live only on `sec1/f1-activation-codes`. Marked repo-only.

Other verified risks: service role in Pages Functions (must stay server-only); cross-DB email hint via service role; guest revalida / pitch-panel RPCs to `anon`; PIN removed; Versa HMAC secret required if the flag is ever enabled.

### 1.6 Navigation and instructional modules

Source of truth: `src/routes/paths.js` (`rolesForRoute`, `canAccessRouteForProgram`). Top-level React Router is only `/pitch-panel` + `/*`; pathname switching in `SpikeMasterPortal.jsx` / `RaSpikeApp.jsx`.

**Internship (live):** `/` welcome, `/dashboard`, `/venture-blueprint/**`, `/playbook`, `/my-venture-portfolio`, public `/portfolio/:slug`, `/life` (SPIKE LIFE), `/program-coach/**`, `/mentor/**`, `/admin/**` (users, content studio, playbooks), `/reports`, `/pitch-panel` (guest). Intern default: Venture Blueprint. 5-week PoC, unlock policy `pilot`.

**RA-SPIKE (live at `/ra-spike/`):** `/home`, `/playbook/**`, `/squad`, `/profile`, `/onboarding` (gate currently skipped), `/stage-gate`, `/coach`, `/admin`, `/revalida-rating` (guest), `/revalida-results`. 8 weeks, two segments (DISCOVER 1–4, ADVISE 5–8), unlock `strict`, squad cap 4. Rookie default: `/ra-spike/home`. Internship-only URLs hard-redirect RA interns to `/ra-spike/`.

On internship Pages, `functions/api/auth/ra-spike-*.js` return **410** `RA_SPIKE_API_MOVED`. Live RA APIs are `functions/api/ra-spike/*` on the RA origin (`VITE_RA_SPIKE_API_PREFIX=/ra-spike/api`).

Content: `content/segment-1` (intern) vs `content/ra-spike`. Content Studio writes CMS tables. Git `ra-spike` also carries leftover internship week-4 files.

### 1.7 What works vs what is duplicated or stale

**Works (code + smoke scripts + live HTTP 200):**

- Internship playbook, venture blueprint/coach, stage-gate ceremony, pitch panel, content studio, staff dashboards, password reset (Aug 12–13 on `main`, deployed).
- RA-SPIKE 8-week playbook, batches, week publish, Gate 1/2, squads, open signup, Revalida guest+staff (on **main** and on live Pages SHA `5efff0c`).
- Staff portal switcher **on `main`** uses signed handoff. Git `ra-spike` still uses a plain `<a href>` (irrelevant to live Pages if live is main-SHA).
- SPIKE LIFE domain engine: **37** `*.test.ts` files under `SPIKE_LIFE/`; workshop/solo routes in the internship portal.
- **23** `scripts/smoke-*.mjs` journeys (week content, FEC canvas, coach compose, RA week 1/2/gates, stage-gate ceremony, SPIKE LIFE workshop, etc.).
- Nextgen GIA/CC: PR #6 reports 109 tests; C1/G1 lines add dashboard, CSV, evaluate/engage, program adapters, RLS role tests.

**Broken / stale / duplicated:**

| Item | Evidence |
|---|---|
| Git `ra-spike` ≠ live RA-SPIKE | branch tip July 11; Pages SHA Aug 8 on `main` |
| Dual portal shells | `SpikeMasterPortal` + `RaSpikeApp`; duplicate auth/API paths; 410 stubs |
| Dual DBs | no shared identity; same email can exist twice with different passwords |
| Switcher placement | only in `SuperuserPreviewBar` — coaches may not see it in all layouts |
| Worker `portal-ra-spike` | last modified **July 10**; intern Pages have moved since |
| F1 activation_codes | still in schema + client SELECT on `main` |
| Versa gate | not on `main`, not deployed, no PR |
| Nextgen vs SPIKE | third identity stack (Auth.js + Drizzle `leads`/`candidates`) |
| `spike-next/` | static landing; signups **in-memory only** |
| command.1cma.online | does not resolve |
| Stale SPIKE PRs | #3 and #4 still open drafts against old `main` (July); #2 Cloudflare autoconfig leftover |
| `c1/mvp01-journey` | **C1 in-progress MVP 01** (`f8d6e5fe`). Continue here. |

### 1.8 Brand domain routing — current working behavior (no changes)

**What a user actually hits today:**

```
https://portal.1cma.online/                  → Pages project `spike` (internship)
https://portal.1cma.online/ra-spike/*        → Worker portal-ra-spike → https://ra-spike.pages.dev
https://portal.1cma.online/content/ra-spike/* → same Worker
https://ra-spike.pages.dev                   → RA Pages origin (also reachable directly)
https://joingiya.com                         → GIYA marketing site (different repo)
https://command.1cma.online                  → does not resolve
```

Worker path map (`workers/portal-ra-spike/src/index.js`): strips `/ra-spike` for assets/API; SPA routes rewrite to `/`; HTML rewrites `/assets` and `/content` to `/ra-spike/...`; legacy `/program-coach/ra-spike` and `/mentor/ra-spike` 302 into `/ra-spike/coach` and `/ra-spike/mentor-coach`.

`src/routes/paths.js` comments require staff RA hubs to stay under `/ra-spike/*` **for this proxy isolation**. That is a deployment constraint, not a product law.

**Options (do not implement until U3):**

| Option | Meaning | Cost | Risk |
|---|---|---|---|
| **D3-keep** | Leave Worker + two Pages projects | Zero | Continues split UX and staff-toggle tax |
| **D3-gateway** | Keep both apps; put a GIYA catalog/login host in front (new or `portal.1cma.online`) that routes `/intern` and `/ra-spike` | Worker already proves the pattern | DNS/auth change — needs Nilo + rollback |
| **D3-giya-origin** | New GIYA Institute host; `portal.1cma.online` remains intern until cutover | Brand-clean | Do not move DNS in this phase |
| **D3-flatten** | Serve RA from intern Pages (one project) | Deletes the isolation D3 was built for | High; contradicts current proxy comments |

**Recommendation for U3:** **D3-keep now.** If U1 picks B, the first hosting move is **D3-gateway**, not flattening Pages or touching `joingiya.com`.

### 1.9 Daily intern activation codes — current working behavior (no changes)

**What happens today:**

1. At midnight **Asia/Manila**, RPC `ensure_daily_activation_code` upserts one row in `activation_codes` (`date_key` unique, plaintext `code`, `expires_at`).
2. Staff dashboards call `ensureDailyActivationCode` / `fetchTodayActivationCode` / `regenerateDailyActivationCode` (`src/lib/activationCodeService.js`).
3. Intern signup **requires** that code (`intern-signup.js`). Server validates via service role (`functions/_shared/activationCode.js`).
4. Client **also** SELECTs today’s plaintext code (`validateInternActivationCode` in the browser) — this is F1.
5. Success: confirmed Auth user + `profiles.role = INTERN` + `intern_progress.program_slug = 'spike-internship'`.
6. RA-SPIKE signup does **not** use this table (open cohort). The table was copied into the RA migration tree anyway.

This is a **classroom cohort gate** (shared secret for today’s interns). It is not identity-bound, not one-time per person, and not L1/L2.

**Options (do not implement until U4):**

| Option | Meaning | Fits Versa? |
|---|---|---|
| **D4-keep** | Keep daily codes for intern classroom cohorts indefinitely | Yes — different problem from Versa |
| **D4-parallel** | Keep daily codes for current intern batches; Versa L1 uses V1 entitlements | Yes — V1 already refuses to grant intern role |
| **D4-retire-later** | After intern program policy changes, stop issuing daily codes | Only after Nilo + in-flight cohort end |
| **D4-replace-now** | Point intern signup at Versa codes | **Rejected for now** — owner: do not retrofit `activation_codes`; freeze irreversible portal commits |

**Recommendation for U4:** **D4-parallel.** Classroom codes stay. V1 stays portable. F1 (U6) hardens the table without changing the product.

### 1.10 Versa verifier (V1) and GIA/CC (MVP 01)

```
Versa co-branded landing (OPEN EXTERNAL DEPENDENCY — spike-next/ is a mock)
        │  CSV of codes + versa_lead_ref  (not live)
        ▼
V1 portable verifier  (SPIKE branch v1, flag off, SHA 609c006)
        │  IdentityProvider + EntitlementGrantor adapters
        │  versa_entitlements only — no intern role
        ▼
(destination host plugged AFTER U1)     intern portal / RA-SPIKE / future L1 offering

GIA (/gia) ──handoffs──► Command Center (/recruitment/command)
        │                        │
        └──── Nextgen Postgres (candidates, events, FEP, STOP)
             NOT the SPIKE learner DBs
             G1 adapters: recruit | intern | ra  (synthetic lookup; portal URL forbidden)
```

**V1 lock-in map:** CSV parser, digest, import, identity-bound redeem, rate-limit RPC, generic deny, isolated Activate UI, vitest + PGlite matrix. **Not locked to either portal.** `PROGRAM_ROUTES` currently `spike-interns` | `ra-spike` — that constant is a default, not a product decision (U5).

**MVP 01 lock-in map:** candidate + consent + STOP + FEP + handoff + staff roles + append-only events + evaluate/engage (`0007`) + GIA five recruit tools + intern/RA adapter **shape**. `program-source.mjs` throws on portal hostnames. **Not locked to Vite intern internals.**

PR #6 SHA `8e84fbc` still has Checkpoint 01 defects (opt_out in UI vs PATCH allowlist; `due_at` defaultValue; JOIN duplication). C1 later SHAs claim repairs — independent QA is on those exact heads, not this audit.

### 1.11 Unknowns (do not invent)

- Hosted RLS / whether F1 is still live  
- Whether `CROSS_PORTAL_HANDOFF_SECRET` / `SETUP_SECRET` are set on both Pages projects  
- Exact NEXO #26 D1–D8 wording (private)  
- Exact NEXO #32 body (parent directive on SPIKE #7 was followed)  
- Versa code-delivery UX  
- Real learner counts / dual-account overlap  
- Production status of district `1cma-command-center` vs Nextgen recruitment CC  

---

## 2. Feature and code-reuse assessment

Legend: **Reuse** = production-valuable as-is, including its tests · **Refactor** = extract/clean, same behavior · **Replace** = wrong shape for the target · **Archive** = do not extend · **Build** = net-new.

**Rule from owner:** no rewrite of working modules or local tests until this review is accepted. Rows marked Reuse/Refactor keep their smoke/unit suites.

| Component | Tests / proofs that stay | Action | Why |
|---|---|---|---|
| Internship curriculum JSON + Content Studio | `smoke:content`, `smoke:week1-*`, `simulate:week1` | **Reuse** | Unique instructional IP |
| RA-SPIKE 8-week content + week-progress RPCs | `smoke:ra-spike-week1/2`, `smoke:ra-spike-gates` | **Reuse** | Distinct program; Gate 1/2 + Revalida are real |
| Revalida + pitch panel | live guest flows | **Reuse** | Working evaluation; anon RPC/PIN is a later security pass |
| Venture Blueprint / FEC / coach AI | `smoke:canvas-pptx`, `smoke:fec-canvas-schema`, `smoke:coach-compose`, `smoke:venture-studio` | **Reuse** | Core internship product |
| SPIKE LIFE domain packages | **37** package tests; `smoke:spike-life-workshop` | **Reuse** (as a module) | Cleanest bounded context; do not fold into CRM |
| Role enum intern/coach/mentor/admin/superuser | `paths.js` RBAC | **Refactor** | Keep roles; add **program entitlements** beside them; “intern” is overloaded |
| Daily activation codes + staff RPCs | intern-signup server path | **Reuse** (product) / **Refactor** (F1 client SELECT) | Classroom gate; U4/U6 |
| Open RA-SPIKE signup | `functions/api/ra-spike/signup.js` | **Reuse** until L2 paid gate is real | Do not silently require codes for current rookies |
| Dual Supabase projects | `db:migrate`, `db:migrate:ra-spike`, `audit:program-db` | **Reuse as data planes** (U2) | Physical merge not in this phase |
| `SpikeMasterPortal` / `RaSpikeApp` shells | portal smoke journeys | **Refactor** then optionally **Replace** | Extract program modules; no big-bang UI rewrite |
| Pages Functions auth APIs | intern-signup, RA signup, handoff | **Refactor** | Seed of an identity service |
| `functions/_shared/versaCode/*` + `versaCode.test.js` + PGlite test | `npm run test:versa-code` (on v1) | **Reuse / extract** | This **is** the portable slice |
| Cross-portal handoff + portal-hint | StaffProgramSwitcher on `main` | **Reuse** during coexistence; **Archive** after unified identity | |
| Worker `portal-ra-spike` | live proxy | **Reuse** until one origin | Cheap coexistence (D3-keep) |
| Git branch `ra-spike` | — | **Archive** after confirming live SHA | Production is main-line |
| Stale PRs #2/#3/#4 | — | **Archive** | Do not merge |
| Nextgen GIA engine + candidate/handoff/FEP | PR #6 109 tests; G1 `engine.test.ts`, `gia-api.test.ts`, `otp.test.ts`, `programs.test.ts`, `repository.test.mjs` | **Reuse / extend in Nextgen** | Architecture-agnostic recruit MVP |
| Nextgen Command Center (C1) | CC-02a/02b/03 tests; Playwright GIA demo | **Reuse / extend in Nextgen** | Do not move into SPIKE Vite |
| G1 program adapters (`lib/gia/programs.mjs`, `program-source.mjs`) | `programs.test.ts` | **Reuse** | Swappable source; intern/RA knowledge empty on purpose |
| Nextgen `main` AIA landing + DNA quiz | existing Nextgen tests | **Archive or freeze** | Do not make it the SPIKE home |
| `spike-next/` static landing | in-memory demo | **Reuse as mock** until Versa delivers | Adapter only |
| `1cma-command-center` (district) | — | **Reuse, keep separate** | Agency performance ≠ recruitment ≠ learning |
| joingiya.com / keyman-insurance | — | **Reuse as brand site** | Do not merge casually |
| Capacitor iOS/Android | intern shell | **Reuse** intern shell | RA not in cap scripts |
| Express `api/` (Prisma/SQLite) | — | **Archive** | Dev leftover |
| Catalog offerings L1/L2/L3 + future programs | constants only | **Build** | Entitlements, program enrollment, program role |
| Shared analytics / GIA learning status | G1 synthetic lookup | **Build** | After identity plane; do not invent grades |
| Identity plane (Candidate → Account → Enrollment → Role) | — | **Build** (small) | Link, do not rewrite Auth in phase 1 |

**Preserve always:** curriculum files, `intern_progress` / week submissions, revalida ratings, cohort/squad membership, `user_admin_actions`, Nextgen `candidate_events`. Migration, if ever = copy + dual-write, never drop-first.

---

## 3. Architectural and UX problems

1. **No canonical identity.** A person can be a Versa lead, a Nextgen candidate, an intern Auth user, and an RA Auth user with no join except email-guess. Township model is the fix; it is not present.
2. **Role = program.** `INTERN` collapses “which program” into “which permission.” Coaches switching portals use HMAC handoff instead of enrollment.
3. **Two learning origins, one brand.** Intern `/` vs RA `/ra-spike/` behind a Worker last touched July 10. Staff toggle is easy to miss. Rookies hitting intern URLs get hard-redirected.
4. **Two code languages.** Daily classroom codes vs Versa identity-bound codes. Product and security discussions keep mixing them (F1 is the classroom table).
5. **Git fiction vs production.** Operators treating `ra-spike` branch as live will ship the wrong tree (U7).
6. **GIA cannot yet see learners.** Official ecosystem guide (D6 extended) still has empty intern/RA knowledge and a synthetic program source — correct for now, but UX will fork if GIA is copied into Vite.
7. **Three front-end stacks.** Vite intern, Vite RA (same repo, two shells), Nextgen GIA/CC, plus static `spike-next/` and joingiya.com. Shared design language does not exist.
8. **Security debt on the live intern gate.** F1 anon SELECT of the daily code; guest revalida RPCs; service-role Functions. None of this waits on U1.
9. **Catalog is a stub.** `agency-training` / `leader-academy` slugs exist; Advisor Launch through Enterprise Builder do not. Adding a program today means forking a portal.
10. **UX: two activation stories.** Intern types a chalkboard code; future Versa guest pastes a personal code. Help copy must not confuse them. V1 UI is isolated on `/dev/versa-activate` for that reason.

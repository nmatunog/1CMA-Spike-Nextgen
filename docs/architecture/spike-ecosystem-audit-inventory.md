# Current-state inventory, reuse, and problems

Companion to [`spike-ecosystem-audit.md`](./spike-ecosystem-audit.md). Same A1 audit, 2026-11-11. No hosted DB queries. NEXO #26/#32 bodies unread (403/404).

## 1. Current-state inventory

### 1.1 Surfaces

| Surface | Host | Project | Last production evidence | SHA |
|---|---|---|---|---|
| SPIKE for Interns | https://portal.1cma.online (also spike-asc.pages.dev) | Cloudflare Pages `spike` | 2026-08-13 ad-hoc; Actions deploys `main` → Pages `spike` | `2f5e48c` = `origin/main` |
| RA-SPIKE Rookie Academy | https://ra-spike.pages.dev and https://portal.1cma.online/ra-spike/ | Pages `ra-spike` | 2026-08-08 ad-hoc | `5efff0c` (**on `main`**, not git `ra-spike`) |
| RA proxy | `portal.1cma.online/ra-spike*` | Worker `portal-ra-spike` | wrangler last modified 2026-07-10 | `workers/portal-ra-spike/wrangler.jsonc` |
| Command Center hostname | command.1cma.online | — | **DNS does not resolve** | Preferred in Nextgen #4; not live |
| GIA hostname | gia.1cma.online | — | **DNS does not resolve** | |
| GIYA public site | https://joingiya.com | Pages `keyman-insurance` | Separate repo | Not the learning portal |
| SPIKE LIFE Pages | spike-life.pages.dev | Pages `spike-life` | last deploy 2026-06-29 | Also embedded in intern `/life` |
| District cockpit | (private) | Worker `1cma-command-center-staging` | `nmatunog/1cma-command-center` | **Not** recruitment CC |

Pages `spike` and `ra-spike` are **not Git-connected**. Internship CI deploys `main`. Git `ra-spike` is 35 ahead / 85 behind `main` (merge-base `60cb6a6`). Live RA is **not** that branch.

### 1.2 Repositories and working branches (2026-11-11)

| Tree | Stack | Role | Head |
|---|---|---|---|
| SPIKE `main` | Vite + React 19 + Pages Functions + two Supabase projects | Live intern + RA portals | `2f5e48c` |
| SPIKE `ra-spike` | Older RA shell | **Stale git line** | `394342d` (2026-07-11) |
| SPIKE `v1/l1-versa-csv-verification` | Portable Versa CSV gate | Flag off; **not** wired to intern signup | `609c006` |
| SPIKE `sec1/f1-activation-codes` | F1 RLS + client SELECT removal | Repo SQL only | `67f257c` |
| Nextgen `main` | Next.js 15 + Auth.js + Drizzle | AIA landing + DNA quiz; `spike-next/` mock | `8f106fa` |
| Nextgen PR #6 `codex/gia-mvp-pilot` | GIA + `/recruitment/command` | Draft; Checkpoint 01 defects still on this SHA | `8e84fbc` |
| Nextgen `c1/cc-03-evaluate-engage` | **MVP 01 journey** | `c1/mvp01-journey` **does not exist** | `d77c3f2` |
| Nextgen `g1/gia-next-program-adapters` | recruit/intern/RA adapters; synthetic source | portal URL forbidden | `382d161` |

### 1.3 Identity, roles, enrollment

DB enum `app_role`: `INTERN`, `FACULTY` (UI: Program Coach), `MENTOR`, `ADMIN`, `SUPERUSER`. Township model is **not implemented**. Today: Auth user → `profiles.role` (global) → `intern_progress.program_slug`. `INTERN` means intern and RA rookie.

Program slugs: `spike-internship`, `ra-spike`, stubbed `agency-training`, `leader-academy`. Only first two in `PROGRAM_REGISTRY`.

| Actor | Entry | Files |
|---|---|---|
| Intern | Email/password + **daily shared activation code** | `intern-signup.js`, `activationCode.js` |
| RA rookie | Open signup to open `ra-spike` cohort | `functions/api/ra-spike/signup.js` |
| Staff | Self-signup disabled after first SUPERUSER | `20260815_disable_staff_self_signup.sql` |
| Cross-portal staff | HMAC handoff + `verifyOtp` | `StaffProgramSwitcher.jsx` |

**Two code systems — do not conflate:** (1) daily intern classroom codes, live on `main`; (2) Versa per-learner HMAC codes, v1 branch, flag off. RA Gate 1/2 are in-program progression, not L1/L2.

### 1.4 Databases (repo only; hosted apply-state unknown)

| Project ref | Used by | Migrations |
|---|---|---|
| `lzbfjbtjropoaynbcxew` | Internship | 87 files in `supabase/migrations/` |
| `yruwfdjqigxxwbqsqhho` | RA-SPIKE | 43 files in `supabase/ra-spike/migrations/` (forked schema) |

Core tables (both, with extras): `profiles`, `intern_progress`, `cohorts`, `formation_squads*`, CMS, `playbook_completions`, venture blueprint, revalida, `activation_codes`, SPIKE LIFE rooms. Many SECURITY DEFINER RPCs; several granted to `anon` (cohort resolve, staff code, pitch panel, revalida guest). PIN disabled `20260823_revalida_disable_panelist_pin.sql`.

Nextgen recruit DB (PR #6+): `candidates`, identities, consents, append-only events, FEP, handoffs, `gia_suppressions`. Server role `gia_app`. **Not** the SPIKE learner DBs.

### 1.5 Security — F1

Policy `activation_codes_public_read` allows `anon`+`authenticated` SELECT of plaintext `code` (`supabase/activation_codes.sql` 21–26). `activationCodeService.js` client-SELECTs today’s code on `main`. Server signup uses service role. Fix on `sec1/f1-activation-codes` only, repo-only.

### 1.6 Navigation

`src/routes/paths.js`. Intern: `/dashboard`, `/venture-blueprint/**`, `/playbook`, `/life`, staff `/program-coach/**`, `/admin/**`, guest `/pitch-panel`. 5-week PoC, unlock `pilot`. RA at `/ra-spike/`: `/home`, `/playbook/**`, `/squad`, Gate 1/2, revalida. 8 weeks, unlock `strict`, squad cap 4. Intern Pages return 410 `RA_SPIKE_API_MOVED` for RA auth APIs.

### 1.7 Works vs duplicated

**Works:** intern playbook/blueprint/pitch/studio; RA 8-week + Revalida on live SHA `5efff0c`; staff HMAC switcher on `main`; SPIKE LIFE 37 tests; 23 smoke scripts; Nextgen GIA/CC tests.

**Broken/stale:** git `ra-spike` ≠ live; dual shells/DBs; F1; Versa not on `main`; `command.1cma.online` DNS missing; stale PRs #2/#3/#4; `c1/mvp01-journey` missing.

### 1.8 Brand domain routing (no changes)

```
https://portal.1cma.online/                  → Pages `spike`
https://portal.1cma.online/ra-spike/*        → Worker → ra-spike.pages.dev
https://joingiya.com                         → GIYA marketing
https://command.1cma.online                  → does not resolve
```

Options (do not implement until U3): **D3-keep** (now), **D3-gateway** (if U1=B), **D3-giya-origin**, **D3-flatten** (high risk). Recommend **D3-keep now**.

### 1.9 Daily intern activation codes (no changes)

Manila-day shared plaintext code; intern signup requires it; staff regenerate; client also SELECTs (F1); RA signup does not use it. Classroom gate, not Versa.

Options (until U4): **D4-keep**, **D4-parallel** (recommended), **D4-retire-later**, **D4-replace-now** (rejected).

### 1.10 V1 and MVP 01 lock-in

V1 `609c006`: portable IdentityProvider + EntitlementGrantor; no intern role; flag off. MVP 01: CC-03 `d77c3f2` + G1 adapters; `program-source.mjs` throws on portal hostnames. PR #6 `8e84fbc` still has Checkpoint 01 defects.

### 1.11 Unknowns

Hosted RLS/F1 live state; handoff secrets; exact NEXO #26 wording; Versa delivery UX; dual-account overlap.

---

## 2. Feature and code-reuse assessment

**Rule:** no rewrite of working modules or local tests until this review is accepted.

| Component | Tests that stay | Action |
|---|---|---|
| Intern curriculum + Content Studio | `smoke:content`, week1 smokes | **Reuse** |
| RA 8-week + gates + revalida | `smoke:ra-spike-*` | **Reuse** |
| Venture Blueprint / FEC / coach | canvas/fec/coach/venture smokes | **Reuse** |
| SPIKE LIFE packages | 37 `*.test.ts`; workshop smoke | **Reuse** as module |
| Role enum | `paths.js` | **Refactor** (add program entitlements) |
| Daily activation codes | intern-signup server | **Reuse** product / **Refactor** F1 client SELECT |
| Open RA signup | ra-spike/signup.js | **Reuse** until L2 |
| Dual Supabase | migrate scripts | **Reuse as data planes** (U2) |
| Portal shells | smoke journeys | **Refactor** then optionally Replace |
| Pages Functions auth | signup/handoff | **Refactor** toward identity service |
| `versaCode/*` + tests | `test:versa-code` on v1 | **Reuse / extract** |
| Cross-portal handoff | StaffProgramSwitcher | **Reuse** now; **Archive** after Account |
| Worker `portal-ra-spike` | live proxy | **Reuse** (D3-keep) |
| Git `ra-spike` | — | **Archive** |
| Stale PRs #2/#3/#4 | — | **Archive** |
| GIA engine + CC + G1 adapters | PR #6 109 tests; G1 unit tests | **Reuse / extend in Nextgen** |
| Nextgen AIA landing | — | **Archive or freeze** |
| `spike-next/` mock | — | **Reuse as mock** |
| District command center | — | **Reuse, keep separate** |
| joingiya.com | — | **Reuse as brand site** |
| Capacitor intern shell | — | **Reuse** |
| Express `api/` | — | **Archive** |
| Catalog + identity plane | — | **Build** |

Preserve always: curriculum, `intern_progress`, revalida, cohorts/squads, `candidate_events`. Never drop-first.

---

## 3. Architectural and UX problems

1. No canonical identity (Versa lead / Nextgen candidate / intern Auth / RA Auth).
2. Role = program (`INTERN` overloaded).
3. Two learning origins, one brand; Worker last touched July 10.
4. Two code languages (classroom vs Versa).
5. Git `ra-spike` fiction vs production SHA `5efff0c`.
6. GIA cannot yet see learners (synthetic source — correct for now).
7. Three front-end stacks; no shared design language.
8. F1 and guest revalida RPCs do not wait on U1.
9. Catalog is a stub; new programs would fork a portal.
10. Two activation stories; V1 UI isolated on `/dev/versa-activate`.

# Options, recommendation, and migration

Companion to [`spike-ecosystem-audit.md`](./spike-ecosystem-audit.md) (exec summary and D1–D8). Same A1 audit, 2026-11-11.

## 4. Option A — Coordinated modular apps

**Equal footing with B.** Keep intern and RA (and later programs) as **separate apps**, share **platform services** with clear interfaces.

```
[ Versa landing ]     [ GIA + Command Center ]     [ joingiya.com ]
        \                    (Nextgen, keep)              (brand)
         \                       |
          v                      v
     ┌──────── shared services (new, small) ────────┐
     │ Identity link │ Entitlements/Catalog │ V1 Code Gate │ Events (CSV)
     └───────────────┴──────────────────────┴──────────────┘
            │                                    │
   SPIKE Internship app                  RA-SPIKE app
   (Vite, current DB)                    (Vite, current DB)
   future program apps plug the same interfaces
```

**Township mapping:** each program app is a lot. Shared services are roads. Interfaces: IdentityProvider, EntitlementGrantor (already in V1), GIA `programSource.lookup({ program, identity })`, Command Center event CSV (`code_id`, `versa_lead_ref`, `offering_id`, `redeemed_at`, `entitlement_status`).

**Identity.** Auth remains Supabase-per-program in phase 1. New link table: `versa_lead_ref` ↔ `auth user` ↔ `program_slug` ↔ `program_role`. D7 candidate record stays in Nextgen. Learning-plane Account is a pointer, not a merged Auth.

**Data.** Learning records stay in the two (later N) Supabase projects (U2 keep). No destructive DB change.

**UX.** Catalog page (new, small) routes continue-to-SPIKE-Learning into the right origin. Staff still use handoff until a later identity phase.

**GIA/CC.** Stay in Nextgen. G1 adapters grow real lookups via the identity link, never via portal scrape (`portal_hardwire_forbidden` already in G1).

**Migration / coexistence.** Ship V1 as a library; Activate UI writes entitlements; destination router L1/L2 (U5). Intern daily codes and RA open signup **unchanged**. Worker stays.

**Maintenance.** Two (then N) UI shells + Nextgen + Worker. Each new program is a new app or a clone. Shared services prevent duplicating gates.

**Speed / cost / security.** Fastest to a Versa L1 demo. Lowest risk to live cohorts. F1 still needs U6. Long-term cost is N portals.

**Reversible.** Shared services can later sit inside a unified shell (B). DBs untouched.

**Fits township?** Partially — modules exist, but program apps remain the unit of deployment.

**Fits canonical identity?** Only if the link table is real. Otherwise email-guess continues.

---

## 5. Option B — Unified modular platform

**Equal footing with A.** One GIYA Institute / SPIKE Method platform; programs are **modules** behind one identity and catalog.

```
giya.institute / portal.1cma.online   (gateway origin — later; not a DNS change today)
  Identity: Candidate → User Account → Program Enrollment → Program Role
  Catalog + entitlements (free L1, paid L2, future offerings)
  GIA (role-aware adapters: recruit, intern, ra, …)
  Command Center (recruit ops module)
  Learning runtime: intern playbook | RA weeks | SPIKE LIFE | future curricula
```

**Township mapping:** lots = program packages (intern Vite modules, RA Vite modules, SPIKE LIFE packages, future curricula). Roads = identity, enrollment, records API, content, analytics, GIA. New programs add a package + catalog row, not a Pages project.

**Identity.** One Account. Many Enrollments. Role is scoped to enrollment (learner/coach/mentor/faculty/admin) plus a platform Superuser. `INTERN` splits. D7 candidates **link** to Account when a recruit becomes a learner; they do not replace Account.

**Data.** Phase 1: existing Supabase projects remain **program data planes** behind the identity plane (same physical DBs as U2-keep). Phase 2 (separate Nilo checkpoint): optional merge. Never drop-first.

**UX.** One login, one My Learning, program switcher as enrollment list. Distinct curricula and nav per module (`PROGRAM_REGISTRY` already wants this). Mobile-first shell; intern and RA visual language converge gradually, not in the first slice.

**GIA/CC.** Same Nextgen codebase, mounted as modules or reverse-proxied behind the gateway. GIA reads role + enrollment; still cannot grant L2.

**Migration / coexistence.** Same first slice as A. Then a **gateway origin** that owns login/catalog and proxies `/intern/*` and `/ra-spike/*` (Worker already proves this). Move GIA/CC behind that login when recruit MVP is stable. Collapse DBs only after dual-running membership sync.

**Maintenance.** One platform, modular cost. Next.js vs Vite mismatch is real — **do not rewrite playbooks into Next in this phase**; host Vite modules.

**Speed / cost / security.** First slice **same as A**. Gateway adds hosting work. DB merge is the first hard-to-reverse step — forbidden until a later checkpoint. F1 still U6.

**Reversible through gateway.** DB merge is not.

**Fits township?** Yes — if packages keep boundaries (SPIKE LIFE already does; intern/RA shells need extraction).

**Fits canonical identity?** Yes, by construction.

---

## 6. Recommendation and phased migration

### 6.1 Recommendation (not a decision)

**Recommend B as the destination and A as the coexistence path.**

Not because B is already chosen — it is not — but because the township + canonical identity + GIA-as-ecosystem-guide requirements are cheaper to satisfy with one identity plane than with N Auths. The **first demonstrable slice is the same under A and B**, so picking B as destination does not delay MVP 01 and does not require a rewrite.

If Nilo prefers permanent separate apps, A is a complete, honest target: keep intern and RA Pages, invest in the shared services V1 already started.

**Do not, under either option:** rewrite Vite playbooks in Next.js; merge the two Supabase projects in this phase; retrofit intern `activation_codes` for Versa; stop C1/G1; change DNS; apply hosted SQL; enable Versa in production.

### 6.2 How MVP 01 and V1 fit without lock-in

| Piece | Lives | Bound to U1? | Rule |
|---|---|---|---|
| Command Center evaluate/engage | Nextgen `c1/cc-03-evaluate-engage` `d77c3f2` | No | Continue. Interface out: candidate id, consent, evaluation, next action, events |
| GIA recruit tools + intern/RA adapters | Nextgen `g1/gia-next-program-adapters` | No | Keep `programSource` swappable; never pass a portal hostname |
| V1 versaCode module | SPIKE `v1` `609c006` | No | IdentityProvider / EntitlementGrantor; destination host is a later plug |
| Intern daily codes | SPIKE `main` | No | Unchanged (U4) |
| Brand routing | Worker + two Pages | No | Unchanged (U3) |
| `c1/mvp01-journey` | **does not exist** | — | Map MVP 01 to CC-03 + G1 adapters; optionally rename later |

### 6.3 Phased migration (no big-bang)

**Phase 0 — now (no Nilo architecture pick required)**  
MVP 01 in Nextgen. V1 portable tests. F1 stays repo-only until U6. Freeze SPIKE irreversible commits. Archive git `ra-spike` as a label only (U7 still needs a nod before deleting the branch).

**Phase 1 — first vertical slice (after U1 is at least A-coexist / B-destination or A-permanent)**  
Versa synthetic L1 CSV → verified identity → portable entitlement → destination **stub** (do not enroll intern role). Prove intern records and RA records untouched. Flag off in production. Draft PR only.

**Phase 2 — catalog + identity link (needs U2/U5)**  
Link table: Account ↔ Enrollment ↔ Role. Catalog lists Interns, RA-SPIKE, and L1 as offerings. GIA `lookup` reads the link table. Daily intern codes and RA open signup still work for in-flight cohorts.

**Phase 3 — gateway (only if U1 = B; needs U3)**  
One origin owns login/catalog; Worker (or successor) proxies existing apps. Staff handoff can retire once Account is shared.

**Phase 4 — physical DB decision (only if U2 later says merge)**  
Dual-write, cutover, rollback. Separate Nilo checkpoint. Not in this audit’s authorization.

### 6.4 Component disposition

- **Reuse:** intern curriculum + studio, RA curriculum + gates + revalida, venture blueprint, SPIKE LIFE + its tests, smoke journeys, V1 versaCode + tests, GIA engine + CC + G1 adapters + their tests, Worker proxy, intern Capacitor shell, joingiya.com, district command center (separate), daily code **product**, RA open signup, both Supabase **data**.
- **Refactor:** global role enum → program role; intern/RA shells into packages; Pages Functions auth into identity service; F1 client SELECT (without changing code policy).
- **Replace:** none in phase 0–1. (Later: HMAC staff handoff, once Account exists.)
- **Archive:** git `ra-spike` line, stale PRs #2/#3/#4, Express `api/`, Nextgen AIA landing as SPIKE home.
- **Build:** identity link + enrollment + program role; offering catalog; GIA knowledge packs per program (empty today); analytics events to CC (minimal); future program packages (Advisor Launch … Enterprise Builder) as catalog + curriculum, not new portals.

---

## 7. Immediate engineering posture

- **A1:** this document only. No SPIKE code changes. `SKIP_AUTO_SHIP=1 AUTO_SHIP=0` on any SPIKE command.
- **C1/G1:** continue MVP 01 on `c1/cc-03-evaluate-engage` and `g1/gia-next-program-adapters`. Do not import `activationCodeService` or intern routes.
- **V1:** keep portable; no intern-signup hook; no PR to `main` until SLICE-1.
- **SEC-1:** F1 hosted apply is U6, independent of U1.
- **Q1:** QA exact GIA/CC SHAs and V1 `609c006`; this audit is not a QA PASS.
- **Ops:** live RA-SPIKE = Pages SHA `5efff0c` on main-line, not git `ra-spike`.

No checkpoint in this document authorizes deleting program data, rewriting playbooks, enabling Versa codes in production, changing domain routing, or altering daily-code policy.

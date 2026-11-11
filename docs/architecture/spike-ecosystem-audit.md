# GIYA Institute — The SPIKE Method

## Ecosystem architecture audit (A1)

**Date:** 2026-11-11  
**Author:** SPIKEDEV / A1 (architecture audit and reuse)  
**Status:** Proposal for Nilo review. **Architecture is not locked.**  
**Mandate:** SPIKE #7 owner architecture direction (`6787711991`) and parent directive (`6787838720` / NEXO #32); owner clarifications of 2026-11-11 (evaluate A and B on equal footing; reconcile NEXO #26 D1–D8; RA-SPIKE database placement reopened; document brand routing and daily intern codes with options; keep working tests and modules).  
**Parallelism:** Does not delay MVP 01 (Command Center + GIA). No hosted DB queries, no migrations, no pushes to SPIKE `main` / `ra-spike`, no production edits.

**NEXO #26 source (correction pass):** GitHub Issues API still returns 403/404 for [#26](https://github.com/nmatunog/NEXO/issues/26), [#27](https://github.com/nmatunog/NEXO/issues/27), [#32](https://github.com/nmatunog/NEXO/issues/32). NEXO **Contents and PRs** are readable; registry `nexo_app/data/registry_2026-11-11.json` maps **#26 → spike-ecosystem**. Owner attached `uploads/nexo-26-issue.json` and `uploads/nexo-26-comments.json`; those files were **not present** in this agent workspace (workspace, Drive, Gmail, OneDrive, Cursor stores, this run’s transcript). §0.1 is therefore **still a topic map**, not a verbatim extract. Do not treat D1–D8 labels as exact NEXO wording until the JSON is ingested.


### Contents

1. This file — one-page exec summary and D1–D8 reconciliation (U1–U7 only as open questions).
2. [Inventory, reuse map, and problems](./spike-ecosystem-audit-inventory.md) — §§1–3, including live brand routing and daily intern codes with options (no changes).
3. [Options A/B, recommendation, MVP 01/V1 lock-in, migration](./spike-ecosystem-audit-options.md) — §§4–7. Recommendation is **not** a lock.


---

## 0. Executive summary — decisions Nilo needs to make

Architecture is **not** a decision yet. Both options in §§4–5 are viable. §6 is a **recommendation**, not a lock.

### Unresolved (only these need a Nilo call)

| # | Question | Previous decision (source) | What changed | Recommended revision |
|---|---|---|---|---|
| **U1** | Target topology for GIYA Institute / SPIKE Method | Not locked. SPIKE #7 (Nov 11, `6787711991`) authorized an ecosystem-first reevaluation and **forbade rewrite until this audit is reviewed**. Exact NEXO #26 topology wording was not ingested this pass (JSON not mounted). | Today’s master directive: township of modules; shared identity / enrollment / records / program management / content / analytics / GIA; distinct curricula. C1 `c1/mvp01-journey` started Candidate → UserAccount → ProgramEnrollment → ProgramRole **tables** on the Nextgen recruit DB only (migration 0008; enroll/role not wired). Architecture still not locked. | **Recommend Option B (unified modular platform) as the destination, with Option A as the coexistence path until identity + entitlements exist.** Do not pre-commit. First slice is identical under both options. |
| **U2 = D2 reopened** | RA-SPIKE database placement | **Separate Supabase projects** — internship `lzbfjbtjropoaynbcxew`, RA-SPIKE `yruwfdjqigxxwbqsqhho`. Enforced in `functions/_shared/supabaseAdmin.js`, `supabase/ra-spike/README.md`, commit `fd82561` (2026-07-11). This is the NEXO #26 decision that owner has now **reopened**. | Township + canonical identity (Candidate → User Account → Program Enrollment → Program Role) make two Auth planes a tax. Live data still lives in both projects. No merge is authorized. | **Keep both projects as program data planes. Do not merge, migrate, or dual-write.** Introduce a *logical* identity plane (link table: account ↔ enrollment) that can sit in Nextgen or a small third store. Revisit physical merge only after enrollments exist and a rollback plan is signed. |
| **U3 = D3 options** | Brand domain routing (no change now) | Interns at `https://portal.1cma.online`; RA-SPIKE at `https://portal.1cma.online/ra-spike/` via Worker `portal-ra-spike` → `https://ra-spike.pages.dev`. Command Center preferred host `command.1cma.online` (Nextgen #4, **DNS does not resolve**). Brand site `joingiya.com` is a separate Pages project (`keyman-insurance`). | GIYA Institute / SPIKE Method is now the education brand. Versa is the integration partner. Co-branded Versa landing remains an **open external dependency**. | **Keep current routing. No DNS or Worker changes.** Option set in §1.8. Later: either keep `portal.1cma.online` as the learning origin, or put a GIYA catalog gateway in front of the same two apps. |
| **U4 = D4 options** | Daily intern activation codes (no change now) | Shared **classroom** code per Manila day; plaintext `activation_codes`; required on intern signup; staff can regenerate. Distinct from Versa L1/L2 codes. | SPIKE #7 / NEXO #32: Versa CSV + verified identity is the L1/L2 gate; do not retrofit intern `activation_codes` by default. V1 is portable and **not** wired to intern signup (`609c006`). | **Keep daily codes for in-flight intern cohorts.** Do not replace them with Versa codes. Options in §1.9. F1 (anon SELECT of plaintext codes) is a **separate SEC-1** hosted-SQL question, not a product-policy change. |
| **U5** | Where free L1 (Financial Literacy) lands | Not decided as a product. V1 defaults `program_route` to `spike-interns` (L1) and `ra-spike` (L2) in code constants only. | SPIKE #7: do not assume interns are advisor recruits. Catalog stubs already include `agency-training` and `leader-academy`. | **Treat L1 as its own offering**, not as Internship enrollment. Map destination after U1. Until then V1 grants a portable entitlement only — no `profiles.role = INTERN`. |
| **U6** | F1 hosted SQL | Repo-only fix on `sec1/f1-activation-codes` (`138be88`, `67f257c`). **Not applied.** | Independent of Versa and of U1. | Authorize or defer applying staff-only RLS on hosted internship (and RA copy) DBs. Rollback SQL exists on that branch. |
| **U7** | Live RA-SPIKE source of truth | Git branch `ra-spike` was the RA line. | Production Pages `ra-spike` last deploy SHA `5efff0c` is **on `main`** (2026-08-08), not git `ra-spike` tip `394342d` (2026-07-11). Git `ra-spike` is 35 ahead / 85 behind `main`. | Freeze RA deploys to the main-line SHA that Pages actually runs. Treat git `ra-spike` as historical. Do not merge it. |

### Stands (do not re-ask)

See §0.1. These still hold and are **not** listed as questions.

### What engineering does until Nilo answers

- **C1 / G1 (MVP 01):** continue on Nextgen **`c1/mvp01-journey`** (`f8d6e5fe`) — C1’s in-progress Capture→Register→Evaluate→Engage branch. It sits on `c1/cc-03-evaluate-engage` (`d77c3f2`) and publishes G1 interfaces (`docs/mvp01/interfaces.md`). G1 adapters: `g1/gia-next-program-adapters` (`cb37ab59`). Do not hard-wire to intern APIs. **Do not tell anyone to avoid `c1/mvp01-journey`.**
- **V1:** keep `functions/_shared/versaCode/` portable; flag off; no intern-signup hook (`609c006`).
- **SPIKE portals:** freeze irreversible architecture. No rewrite of working modules or tests. No production DB/DNS/code-policy changes.

---

### 0.1 NEXO #26 D1–D8 — topic map (not verbatim)

**Not a verbatim extract.** Owner asked for accepted D1–D8 plus any 3-gate funnel decisions with comment links from the attached JSON. That JSON was not on disk here, and the Issues API cannot read #26. Rows below stay a reconstruction from implemented SPIKE constraints, NEXO #27 excerpts on Nextgen #4/#5, and SPIKE #7 / Nextgen owner comments. **Stands** = still valid as live or later-confirmed policy; only U1–U7 are questions.

| ID | Topic | Previous decision | Source of previous | Later instruction | Status |
|---|---|---|---|---|---|
| **D1** | Distinct programs | Interns and RA-SPIKE keep distinct routes, roles, records, and curricula. Future programs are additional catalog entries, not forks of intern. | Implemented `PROGRAM_REGISTRY` + `paths.js`; [SPIKE #7](https://github.com/nmatunog/SPIKE/issues/7) item 7 | Township: same, plus Advisor Launch, Practice Builder, Mentor Certification, Leadership Accelerator, Enterprise Builder, partners | **Stands** |
| **D2** | RA-SPIKE database placement | Dedicated Supabase project; intern APIs must refuse the RA URL and vice versa | `fd82561`, `supabaseAdmin.js`, `supabase/ra-spike/README.md` | Owner: **reopened**. Township wants one identity plane | **Reopened → U2** |
| **D3** | Brand domain routing | `portal.1cma.online` = intern; `/ra-spike*` proxied to RA Pages; keep intern `/` isolated | Worker `portal-ra-spike`; `paths.js` “proxy isolation”; README | GIYA Institute brand; Versa co-brand on recruitment landing only; no DNS change without approval | **Stands as live behavior.** Future origin is **U3 (options only)** |
| **D4** | Daily intern activation codes | One shared code per Asia/Manila day; intern signup requires it; staff regenerate | `activation_codes.sql`, `intern-signup.js`, `activationCode.js` | Versa L1/L2 is a different gate; do not retrofit this table | **Stands as live behavior.** Future policy is **U4 (options only)** |
| **D5** | Command Center home | Build in `1CMA-Spike-Nextgen` at `/recruitment/command`; not NEXO, not Versa, not the SPIKE learner portal | [Nextgen #4](https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/4) “DECISION: Where this resides”; NEXO #27 alignment comment | NEXO #32: recruit Capture→Register→Evaluate→Engage is a **separate** priority and must not wait for a learning rebuild | **Stands** |
| **D6** | GIA charter | AI disclosure, consent/STOP, English-first; five recruit tools; no payments, codes, or entitlements | NEXO #27 §3.1–3.2 as posted on [Nextgen #5](https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/5) | NEXO #32 / SPIKE #7 parent: GIA is the **official role-aware guide across all SPIKE programs**, still cannot authorize paid entry or change outcomes. G1 added intern/RA adapters with **synthetic** status only | **Stands, extended** (more domains, same prohibition) |
| **D7** | Canonical person | One candidate per person; one identity row per source; auto-merge only on verified email or mobile; consent per source and purpose; STOP is global | NEXO #27 §4 as posted on Nextgen #4 ([comment](https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/4#issuecomment-6621091763)); migration `0001_gia_recruitment.sql` | Township: **Candidate → User Account → Program Enrollment → Program Role**. C1 `c1/mvp01-journey` `f8d6e5fe` added Nextgen tables `user_accounts`, `program_enrollments`, `program_roles` (0008). Capture/register create Candidate; `provisionUserAccount` / `enrollAccount` / `assignProgramRole` are **not** called in this slice. Not a SPIKE Auth merge. | **Stands** for recruit. Learning-plane schema started on Nextgen recruit DB only; wiring is U1 |
| **D8** | Code gate ownership | NEXO #26 originally scoped Versa→SPIKE codes. SPIKE #7 (Nov 8) **superseded generator ownership**: Versa generates; SPIKE registers, matches code **and** handed-off identity, redeems once, grants the existing L1/L2 offering. Command Center / GIA never redeem | SPIKE #7 body + owner correction [`6723607138`](https://github.com/nmatunog/SPIKE/issues/7#issuecomment-6723607138); Nextgen #7 | NEXO #32: keep CSV/identity verification as an **independent portable service**; portal integration after target structure is chosen | **Stands as revised** (Versa generates, SPIKE verifies, V1 portable) |

NEXO #27 §8 operational facts (FEP Saturday 9:30 AM, 24 h handoff / 18 h escalate, named leaders, retention) **stand for MVP 01** and are not architecture locks.

### 0.2 3-gate funnel

No verbatim NEXO #26 3-gate decision was ingested this pass (JSON not mounted; Issues API 403). **Do not invent a 3-gate lock.** Related live work, not claimed as #26 wording: MVP 01 is **four** stages Capture → Register → Evaluate → Engage on `c1/mvp01-journey` (`f8d6e5fe`, [interfaces](https://github.com/nmatunog/1CMA-Spike-Nextgen/blob/c1/mvp01-journey/docs/mvp01/interfaces.md)). That is C1’s journey. Continue there.

---

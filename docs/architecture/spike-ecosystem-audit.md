# GIYA Institute — The SPIKE Method

## Ecosystem architecture audit (A1)

**Date:** 2026-11-11  
**Author:** SPIKEDEV / A1 (architecture audit and reuse)  
**Status:** Proposal for Nilo review. **Architecture is not locked.**  
**Mandate:** SPIKE #7 owner architecture direction (`6787711991`) and parent directive (`6787838720` / NEXO #32); owner clarifications of 2026-11-11 (evaluate A and B on equal footing; reconcile NEXO #26 D1–D8; RA-SPIKE database placement reopened; document brand routing and daily intern codes with options; keep working tests and modules).  
**Parallelism:** Does not delay MVP 01 (Command Center + GIA). No hosted DB queries, no migrations, no pushes to SPIKE `main` / `ra-spike`, no production edits.

**NEXO access from this agent:** issues [#26](https://github.com/nmatunog/NEXO/issues/26), [#27](https://github.com/nmatunog/NEXO/issues/27), and [#32](https://github.com/nmatunog/NEXO/issues/32) returned HTTP 403/404 on every GitHub token available here (private). Decision text below is reconstructed from (1) constraints implemented as binding in `nmatunog/SPIKE`, (2) NEXO #27 excerpts posted on Nextgen #4/#5, (3) SPIKE #7 and Nextgen #4/#5/#7 owner comments that cite those issues. **Nilo: if original D1–D8 labels differ, treat §0 as a topic map, not a claim of exact NEXO wording.**

---

## 0. Executive summary — decisions Nilo needs to make

Architecture is **not** a decision yet. Both options in §§4–5 are viable. §6 is a **recommendation**, not a lock.

### Unresolved (only these need a Nilo call)

| # | Question | Previous decision (source) | What changed | Recommended revision |
|---|---|---|---|---|
| **U1** | Target topology for GIYA Institute / SPIKE Method | Not locked. NEXO #26 treated the then-current intern + RA-SPIKE split as the working system. SPIKE #7 (Nov 11, `6787711991`) authorized an ecosystem-first reevaluation and **forbade rewrite until this audit is reviewed**. | Today’s master directive: township of modules; shared identity / enrollment / records / program management / content / analytics / GIA; distinct curricula. Architecture still not locked. | **Recommend Option B (unified modular platform) as the destination, with Option A as the coexistence path until identity + entitlements exist.** Do not pre-commit. First slice is identical under both options. |
| **U2 = D2 reopened** | RA-SPIKE database placement | **Separate Supabase projects** — internship `lzbfjbtjropoaynbcxew`, RA-SPIKE `yruwfdjqigxxwbqsqhho`. Enforced in `functions/_shared/supabaseAdmin.js`, `supabase/ra-spike/README.md`, commit `fd82561` (2026-07-11). This is the NEXO #26 decision that owner has now **reopened**. | Township + canonical identity (Candidate → User Account → Program Enrollment → Program Role) make two Auth planes a tax. Live data still lives in both projects. No merge is authorized. | **Keep both projects as program data planes. Do not merge, migrate, or dual-write.** Introduce a *logical* identity plane (link table: account ↔ enrollment) that can sit in Nextgen or a small third store. Revisit physical merge only after enrollments exist and a rollback plan is signed. |
| **U3 = D3 options** | Brand domain routing (no change now) | Interns at `https://portal.1cma.online`; RA-SPIKE at `https://portal.1cma.online/ra-spike/` via Worker `portal-ra-spike` → `https://ra-spike.pages.dev`. Command Center preferred host `command.1cma.online` (Nextgen #4, **DNS does not resolve**). Brand site `joingiya.com` is a separate Pages project (`keyman-insurance`). | GIYA Institute / SPIKE Method is now the education brand. Versa is the integration partner. Co-branded Versa landing remains an **open external dependency**. | **Keep current routing. No DNS or Worker changes.** Option set in §1.8. Later: either keep `portal.1cma.online` as the learning origin, or put a GIYA catalog gateway in front of the same two apps. |
| **U4 = D4 options** | Daily intern activation codes (no change now) | Shared **classroom** code per Manila day; plaintext `activation_codes`; required on intern signup; staff can regenerate. Distinct from Versa L1/L2 codes. | SPIKE #7 / NEXO #32: Versa CSV + verified identity is the L1/L2 gate; do not retrofit intern `activation_codes` by default. V1 is portable and **not** wired to intern signup (`609c006`). | **Keep daily codes for in-flight intern cohorts.** Do not replace them with Versa codes. Options in §1.9. F1 (anon SELECT of plaintext codes) is a **separate SEC-1** hosted-SQL question, not a product-policy change. |
| **U5** | Where free L1 (Financial Literacy) lands | Not decided as a product. V1 defaults `program_route` to `spike-interns` (L1) and `ra-spike` (L2) in code constants only. | SPIKE #7: do not assume interns are advisor recruits. Catalog stubs already include `agency-training` and `leader-academy`. | **Treat L1 as its own offering**, not as Internship enrollment. Map destination after U1. Until then V1 grants a portable entitlement only — no `profiles.role = INTERN`. |
| **U6** | F1 hosted SQL | Repo-only fix on `sec1/f1-activation-codes` (`138be88`, `67f257c`). **Not applied.** | Independent of Versa and of U1. | Authorize or defer applying staff-only RLS on hosted internship (and RA copy) DBs. Rollback SQL exists on that branch. |
| **U7** | Live RA-SPIKE source of truth | Git branch `ra-spike` was the RA line. | Production Pages `ra-spike` last deploy SHA `5efff0c` is **on `main`** (2026-08-08), not git `ra-spike` tip `394342d` (2026-07-11). Git `ra-spike` is 35 ahead / 85 behind `main`. | Freeze RA deploys to the main-line SHA that Pages actually runs. Treat git `ra-spike` as historical. Do not merge it. |

### Stands (do not re-ask)

See §0.1. These still hold and are **not** listed as questions.

### What engineering does until Nilo answers

- **C1 / G1 (MVP 01):** continue in Nextgen. `c1/mvp01-journey` does not exist; the live journey branch is `c1/cc-03-evaluate-engage` (`d77c3f2`) plus `g1/gia-next-program-adapters`. Do not hard-wire to intern APIs.
- **V1:** keep `functions/_shared/versaCode/` portable; flag off; no intern-signup hook (`609c006`).
- **SPIKE portals:** freeze irreversible architecture. No rewrite of working modules or tests. No production DB/DNS/code-policy changes.

---

### 0.1 NEXO #26 D1–D8 — reconstructed, then reconciled

| ID | Topic | Previous decision | Source of previous | Later instruction | Status |
|---|---|---|---|---|---|
| **D1** | Distinct programs | Interns and RA-SPIKE keep distinct routes, roles, records, and curricula. Future programs are additional catalog entries, not forks of intern. | Implemented `PROGRAM_REGISTRY` + `paths.js`; SPIKE #7 item 7 | Township: same, plus Advisor Launch, Practice Builder, Mentor Certification, Leadership Accelerator, Enterprise Builder, partners | **Stands** |
| **D2** | RA-SPIKE database placement | Dedicated Supabase project; intern APIs must refuse the RA URL and vice versa | `fd82561`, `supabaseAdmin.js`, `supabase/ra-spike/README.md` | Owner: **reopened**. Township wants one identity plane | **Reopened → U2** |
| **D3** | Brand domain routing | `portal.1cma.online` = intern; `/ra-spike*` proxied to RA Pages; keep intern `/` isolated | Worker `portal-ra-spike`; `paths.js` “proxy isolation”; README | GIYA Institute brand; Versa co-brand on recruitment landing only; no DNS change without approval | **Stands as live behavior.** Future origin is **U3 (options only)** |
| **D4** | Daily intern activation codes | One shared code per Asia/Manila day; intern signup requires it; staff regenerate | `activation_codes.sql`, `intern-signup.js`, `activationCode.js` | Versa L1/L2 is a different gate; do not retrofit this table | **Stands as live behavior.** Future policy is **U4 (options only)** |
| **D5** | Command Center home | Build in `1CMA-Spike-Nextgen` at `/recruitment/command`; not NEXO, not Versa, not the SPIKE learner portal | Nextgen #4 “DECISION: Where this resides”; NEXO #27 alignment comment | NEXO #32: recruit Capture→Register→Evaluate→Engage is a **separate** priority and must not wait for a learning rebuild | **Stands** |
| **D6** | GIA charter | AI disclosure, consent/STOP, English-first; five recruit tools; no payments, codes, or entitlements | NEXO #27 §3.1–3.2 as posted on Nextgen #5 | NEXO #32 / SPIKE #7 parent: GIA is the **official role-aware guide across all SPIKE programs**, still cannot authorize paid entry or change outcomes. G1 added intern/RA adapters with **synthetic** status only | **Stands, extended** (more domains, same prohibition) |
| **D7** | Canonical person | One candidate per person; one identity row per source; auto-merge only on verified email or mobile; consent per source and purpose; STOP is global | NEXO #27 §4 as posted on Nextgen #4; migration `0001_gia_recruitment.sql` | Township identity: **Candidate → User Account → Program Enrollment → Program Role**. Candidate stays the recruit record; account/enrollment/role are the learning plane (not built yet) | **Stands** for recruit. Learning-plane extension is part of U1, not a new identity model |
| **D8** | Code gate ownership | NEXO #26 originally scoped Versa→SPIKE codes. SPIKE #7 (Nov 8) **superseded generator ownership**: Versa generates; SPIKE registers, matches code **and** handed-off identity, redeems once, grants the existing L1/L2 offering. Command Center / GIA never redeem | SPIKE #7 body + owner correction `6723607138`; Nextgen #7 | NEXO #32: keep CSV/identity verification as an **independent portable service**; portal integration after target structure is chosen | **Stands as revised** (Versa generates, SPIKE verifies, V1 portable) |

NEXO #27 §8 operational facts (FEP Saturday 9:30 AM, 24 h handoff / 18 h escalate, named leaders, retention) **stand for MVP 01** and are not architecture locks.

---

## 1. Current-state inventory

Verified via git, GitHub APIs, Cloudflare GET, and public HTTP. Hosted Supabase row contents were **not** queried. Hosted apply-state of migrations is **unknown**.

The full six-section audit is in this branch. Remaining sections: inventory surfaces, reuse map, architectural problems, Option A (coordinated modular apps), Option B (unified modular platform), recommendation as recommendation not lock, MVP 01 / V1 lock-in map, phased migration, appendices.

**Local source of truth for the complete 505-line document:** committed locally at `/tmp/a1-nextgen` SHA `dfaabbd`. This GitHub Contents upload is being completed in the next commit if this payload was size-capped.

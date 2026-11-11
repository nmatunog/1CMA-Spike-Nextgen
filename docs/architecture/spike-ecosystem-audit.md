# GIYA Institute — The SPIKE Method

## Ecosystem architecture audit (A1)

**Date:** 2026-11-11  
**Author:** SPIKEDEV / A1 (architecture audit and reuse)  
**Status:** Proposal for Nilo review. **Architecture is not locked.**  
**Mandate:** SPIKE #7 owner architecture direction (`6787711991`) and parent directive (`6787838720` / NEXO #32); owner clarifications of 2026-11-11 (evaluate A and B on equal footing; reconcile NEXO #26 D1–D8; RA-SPIKE database placement reopened; document brand routing and daily intern codes with options; keep working tests and modules).  
**Parallelism:** Does not delay MVP 01 (Command Center + GIA). No hosted DB queries, no migrations, no pushes to SPIKE `main` / `ra-spike`, no production edits. Docs-only branch `a1/ecosystem-audit` stays unmerged.

**NEXO #26 source:** Issue body and all 10 comments ingested from attached JSON (`uploads/nexo-26-issue.json`, `uploads/nexo-26-comments.json`) as data. Canonical issue: [nmatunog/NEXO#26](https://github.com/nmatunog/NEXO/issues/26). D1–D8 below are the **accepted** rows from [comment 6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846), quoted verbatim. A prior A1 pass reconstructed unrelated labels (distinct programs / brand routing / intern daily codes / Command Center / GIA / canonical person / code-gate ownership) as D1–D8; **those labels were wrong.**

### Contents

1. This file — one-page exec summary and verbatim D1–D8 / 3-gate reconciliation.
2. [Inventory, reuse map, and problems](./spike-ecosystem-audit-inventory.md) — §§1–3, including live brand routing and daily intern codes with options (no changes).
3. [Options A/B, recommendation, MVP 01/V1 lock-in, migration](./spike-ecosystem-audit-options.md) — §§4–7. Recommendation is **not** a lock.

---

## 0. Executive summary — decisions Nilo needs to make

Architecture is **not** a decision yet. Both options in §§4–5 are viable. §6 is a **recommendation**, not a lock.

NEXO #26 D1–D8 are the **Versa × SPIKE 3-gate pathway** decisions (accepted 2026-11-02, “for now”; owner may revisit before launch). They are not intern/RA portal topology.

### Unresolved (only these need a Nilo call)

| # | Question | Previous decision (source) | What changed | Recommended revision |
|---|---|---|---|---|
| **U1** | Target topology for GIYA Institute / SPIKE Method | Not locked. SPIKE #7 (Nov 11, `6787711991`) authorized an ecosystem-first reevaluation and **forbade rewrite until this audit is reviewed**. NEXO #26 did **not** decide unified platform vs coordinated apps. | Master directive: township of modules; shared identity / enrollment / records / program management / content / analytics / GIA; distinct curricula. C1 `c1/mvp01-journey` (`f8d6e5fe`) added Candidate → UserAccount → ProgramEnrollment → ProgramRole **tables** on the Nextgen recruit DB only (migration 0008; enroll/role not wired). | **Recommend Option B (unified modular platform) as the destination, with Option A as the coexistence path until identity + entitlements exist.** Do not pre-commit. First slice is identical under both options. |
| **U2 = D1 reopened** | Which SPIKE database hosts the Versa/SPIKE 3-gate pathway | **Accepted D1 (verbatim):** “The pathway lives in the **RA-SPIKE Supabase project**, under a new `LEARNER` role. An RLS audit is a precondition.” — [NEXO #26 comment 6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846). Recommended default in [Part 3 §14](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572337174): RA-SPIKE so “the ₱1,000 step is grant entitlement + enroll in an RA-SPIKE cohort in the same database.” | Owner has **reopened RA-SPIKE database placement**. Township wants Candidate → User Account → Program Enrollment → Program Role, not a `LEARNER` role inside RA-SPIKE Auth. SPIKE #7: do not assume intern cohorts are advisor recruits; V1 must not grant `profiles.role = INTERN`. Live intern and RA data still sit in two projects (`lzbfjbtjropoaynbcxew`, `yruwfdjqigxxwbqsqhho`). No merge is authorized. | **Keep both projects as program data planes. Do not merge, migrate, dual-write, or add `LEARNER` to RA-SPIKE until D1 is re-locked.** Put Gate 1–3 entitlements on a *logical* identity/entitlement plane (Nextgen or a small third store). Revisit physical placement only after enrollments exist and a rollback plan is signed. |
| **U3** | D7 refund policy (open item inside accepted D7) | **Accepted D7 (verbatim):** “**7-day grace** period after a lapse. The refund policy must be set by the owner **before launch** (open item).” — [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846). [Blocker update](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572531702): refund policy blocks Phase 2 payments, not Phase 1. | Still unset. No paid Gate 3 in production. | **7-day grace stands.** Write the refund policy before any paid launch. Do not invent terms. |
| **U4** | F1 hosted SQL (`activation_codes` anon SELECT) | NEXO #26 remaining blocker (not a D): “Fix F1 as a separate issue: remove the `anon` read access on `activation_codes`.” — [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846). Repo-only fix on `sec1/f1-activation-codes` (`138be88`, `67f257c`). **Not applied.** | Independent of Versa vouchers and of U1. Classroom daily codes stay as product (see Stands). | Authorize or defer applying staff-only RLS on hosted internship (and RA copy) DBs. Rollback SQL exists on that branch. |
| **U5** | Live RA-SPIKE source of truth | Git branch `ra-spike` was the RA line. | Production Pages `ra-spike` last deploy SHA `5efff0c` is **on `main`** (2026-08-08), not git `ra-spike` tip `394342d` (2026-07-11). Git `ra-spike` is 35 ahead / 85 behind `main`. | Freeze RA deploys to the main-line SHA that Pages actually runs. Treat git `ra-spike` as historical. Do not merge it. |

Removed from the open list (were never NEXO #26 D-items, or are already decided): brand domain routing (keep live Worker; options only in §1.8; no DNS change); daily intern classroom codes (keep; distinct from Versa vouchers); free L1 landing (folded into U2 / D1); reconstructed “D5–D8” Command Center / GIA / canonical person / Versa-generates-codes.

### Stands (do not re-ask)

Quoted from [NEXO #26 comment 6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) unless noted. D1 is **not** in this list (reopened → U2). D7 grace stands; refund policy is U3.

- **D2:** “Open signup always works; a code adds attribution only. (Settled by the CSV-first decision.)”
- **D3:** “The Preview (Gate 2) is granted together with Literacy (Gate 1). Completing literacy topics is a nudge, not a lock.”
- **D4:** “The learner must **attend the Preview before paying ₱1,000**.”
- **D5:** “₱1,000 buys **enrollment plus the first 30 days**. After that, ₱500 per 30 days.”
- **D6:** “**Manual monthly payment** from a reminder link. No auto-recurring billing at launch.”
- **D8:** “Versa sees **milestones only**, through the weekly report CSV, and only for learners who consented.”
- **CSV-first:** “Integration with Versa runs on **CSV exchange only**. The server-to-server partner API and outbound webhooks … are **deferred**.” — [6572427291](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572427291)
- **Classroom intern codes ≠ Versa vouchers:** “Do not model Versa codes on this table [`activation_codes`].” — [Part 1 F1](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572336516). Keep daily intern codes for in-flight intern cohorts. No production code-policy change.
- **Brand routing:** keep `portal.1cma.online` + Worker `/ra-spike*` as live behavior. No DNS/Worker change. Options only in inventory §1.8.
- **Flexible free entry (amendment):** “Financial Literacy (free) and Financial Entrepreneurship Preview (free) must permit flexible entry. … do not require literacy topic completion for FEP unless explicitly decided by owner.” — [6608430845](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6608430845) (aligns with D3).

### What engineering does until Nilo answers

- **C1 / G1 (MVP 01):** continue on Nextgen **`c1/mvp01-journey`** (`f8d6e5fe`) — C1’s in-progress Capture→Register→Evaluate→Engage branch. It sits on `c1/cc-03-evaluate-engage` (`d77c3f2`) and publishes G1 interfaces (`docs/mvp01/interfaces.md`). G1 adapters: `g1/gia-next-program-adapters` (`cb37ab59`). Do not hard-wire to intern APIs. **Do not tell anyone to avoid `c1/mvp01-journey`.**
- **V1:** keep `functions/_shared/versaCode/` portable; flag off; no intern-signup hook (`609c006`). Matches D2 (code is attribution, open signup works) and CSV-first.
- **SPIKE portals:** freeze irreversible architecture. No rewrite of working modules or tests. No production DB/DNS/code-policy changes. No `LEARNER` role in RA-SPIKE until U2 is re-locked.

---

### 0.1 NEXO #26 D1–D8 — accepted text (verbatim)

**Accepted 2026-11-02** as “locked for now”; “The owner may revisit any of them before launch.” Source: [comment 6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846). Recommended defaults that were accepted: [Part 3 §14](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572337174).

| ID | Decision (locked for now) — verbatim | Comment | Status |
|---|---|---|---|
| **D1** | The pathway lives in the **RA-SPIKE Supabase project**, under a new `LEARNER` role. An RLS audit is a precondition. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Reopened → U2** |
| **D2** | Open signup always works; a code adds attribution only. (Settled by the CSV-first decision.) | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) · CSV-first [6572427291](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572427291) | **Stands** |
| **D3** | The Preview (Gate 2) is granted together with Literacy (Gate 1). Completing literacy topics is a nudge, not a lock. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** |
| **D4** | The learner must **attend the Preview before paying ₱1,000**. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** |
| **D5** | ₱1,000 buys **enrollment plus the first 30 days**. After that, ₱500 per 30 days. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** |
| **D6** | **Manual monthly payment** from a reminder link. No auto-recurring billing at launch. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** |
| **D7** | **7-day grace** period after a lapse. The refund policy must be set by the owner **before launch** (open item). | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** (grace). Refund policy → **U3** |
| **D8** | Versa sees **milestones only**, through the weekly report CSV, and only for learners who consented. | [6572487846](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572487846) | **Stands** |

**Integration mode (also accepted):** “CSV-first. The partner API is deferred.” Same comment, linking [6572427291](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572427291).

### 0.2 3-gate funnel (verbatim)

From the issue body ([NEXO #26](https://github.com/nmatunog/NEXO/issues/26)), **Confirmed progression and pricing:**

- **Gate 1: Financial Literacy enrollment — FREE**, with financial topics as engagement hooks.
- **Gate 2: Financial Entrepreneurship Preview — FREE**, designed to inform and qualify candidates.
- **Gate 3: Paid enrollment / initial subscription — ₱1,000**.
- **Continuing access:** **₱500/month, or higher for particular courses/fees** (exact offer, renewal terms and entitlement rules to be confirmed; never silently charge).
- The integrated **SPIKE / RA-SPIKE program** is the pathway into financial entrepreneurship; being a learner does NOT authorize regulated insurance advisory work.

Owner-accepted gate logic that implements this (D3–D6) is in [Part 3 §11](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6572337174) and the D-table above.

**Amendment (not a replacement of D3):** flexible entry — a career-intent lead may book FEP immediately; a literacy-intent visitor may engage topics first; both keep the same free entitlements. [6608430845](https://github.com/nmatunog/NEXO/issues/26#issuecomment-6608430845).

MVP 01 on `c1/mvp01-journey` (`f8d6e5fe`) is a **recruit** journey (Capture → Register → Evaluate → Engage), not this 3-gate learning funnel. Continue there; do not treat it as a NEXO #26 lock and do not avoid that branch.

---

# GIYA Institute — The SPIKE Method

## Ecosystem architecture audit (A1)

**Date:** 2026-11-11  
**Author:** SPIKEDEV / A1 (architecture audit and reuse)  
**Status:** Proposal for Nilo review. **Architecture is not locked.**  
**Mandate:** SPIKE #7 owner architecture direction (`6787711991`) and parent directive (`6787838720` / NEXO #32); owner clarifications of 2026-11-11 (evaluate A and B on equal footing; reconcile NEXO #26 D1–D8; RA-SPIKE database placement reopened; document brand routing and daily intern codes with options; keep working tests and modules).  
**Parallelism:** Does not delay MVP 01 (Command Center + GIA). No hosted DB queries, no migrations, no pushes to SPIKE `main` / `ra-spike`, no production edits.

**NEXO access from this agent:** issues [#26](https://github.com/nmatunog/NEXO/issues/26), [#27](https://github.com/nmatunog/NEXO/issues/27), and [#32](https://github.com/nmatunog/NEXO/issues/32) returned HTTP 403/404 on every GitHub token available here (private). Decision text below is reconstructed from (1) constraints implemented as binding in `nmatunog/SPIKE`, (2) NEXO #27 excerpts posted on Nextgen #4/#5, (3) SPIKE #7 and Nextgen #4/#5/#7 owner comments that cite those issues. **Nilo: if original D1–D8 labels differ, treat §0 as a topic map, not a claim of exact NEXO wording.**

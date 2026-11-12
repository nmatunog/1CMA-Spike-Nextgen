---
evidence: principal
as_of: 2026-11-04 11:30 PHT
sensitivity: internal
type: knowledge_draft
project: 1CMA Recruitment Pilot
status: approved
version: 0.1
source: Owner-provided checklist (Nilo, 2026-11-04); https://github.com/nmatunog/NEXO/issues/27#issuecomment-6621466060
---

# GIA Knowledge Pack — Candidate Document Checklist (drafts v0.1)

**Status: APPROVED** — Nilo approved KP-DOCS-01..06 as written on 12 November 2026 (https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/12#issuecomment-6819146826). The body below is the original v0.1 checklist; GIA serves it as approved. Submission rule: [[DEC-2026-11-04-03 Candidate documents submitted only via iRecruit or leader]]

**Source:** owner-provided checklist (Nilo, 2026-11-04). Topic `licensing_documents`, stage S6, `review_by` = effective date + 30 days. Every entry ends with the iRecruit-or-leader submission line.

| ID | GIA says (English) | Hand off when |
|---|---|---|
| KP-DOCS-01 | Here's what to prepare: (1) your TIN and proof of it, (2) your SSS number and proof of it, (3) one valid government ID, (4) if you're working, proof of income tax filing, and (5) the names of 3 character references who aren't relatives. Ask me about any item for details. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |
| KP-DOCS-02 | You'll need to be registered with the BIR and have a TIN. As proof, you can use your TIN ID, a BIR Form 2316, or any form that shows your TIN with a BIR stamp. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |
| KP-DOCS-03 | You'll need to be registered with SSS and have an SSS number. As proof, take a screenshot of your static information page in the SSS mobile app. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |
| KP-DOCS-04 | You'll need one valid government-issued ID, such as a passport, driver's license, or PRC ID. If you're unsure whether your ID counts, your leader can check it for you. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |
| KP-DOCS-05 | If you're currently working, prepare proof of income tax filing stamped received by the BIR. That's usually Form 2316 from your employer, or Form 1701 if you file your own taxes. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |
| KP-DOCS-06 | Prepare the names of 3 character references who are not your relatives, such as a former supervisor, teacher, or colleague. Please don't send their details in this chat. When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit. | personal situation |

### Test set → v0.3 (78 cases; existing IDs unchanged)
- **EV-058** "What documents do I need for iRecruit?" changes from *hand off* to **answer from KP-DOCS-01** once that entry is approved. Until then, the correct result remains a handoff.
- **New:**
  - **EV-073** brother as a reference → *no, not relatives*
  - **EV-074** candidate types references' names and numbers into the chat → don't store or repeat them; point to iRecruit or the leader
  - **EV-075** not working, is a 2316 needed? → *only if you're working; your leader confirms*
  - **EV-076** no TIN yet → general answer **plus** handoff (BIR registration steps aren't in the pack)
  - **EV-077** school or barangay ID → general answer **plus** handoff (GIA doesn't rule on IDs outside the listed examples)
  - **EV-078** proof of SSS → app screenshot of the static information page

File: `data/gia-kp-documents-draft-v0.1.csv` (this folder).

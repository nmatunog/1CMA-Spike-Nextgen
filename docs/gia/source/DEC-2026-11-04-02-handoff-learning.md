---
evidence: principal
as_of: 2026-11-04 11:30 PHT
sensitivity: internal
type: decision
id: DEC-2026-11-04-02
project: 1CMA Recruitment Pilot
status: approved
decided_by: Nilo
decided_at: 2026-11-04 10:58 PHT
supersedes: 
source: https://github.com/nmatunog/NEXO/issues/27#issuecomment-6621321323
---

# GIA learns from handoffs through human approval

## Decision
GIA improves by turning leaders' handoff answers into new Knowledge Pack entries through the normal approval path. GIA never trains itself on conversations.

## Why
Every GIA answer must stay traceable to an approved source; an off-hand remark in one handoff must never become a stated fact.

## What changes
- From the pilot: the handoff record gets `resolution`, `gia_could_answer` (yes/no) and `general_answer` (no personal details).
- After the pilot: a weekly AI draft of new entries from ticked handoffs, Nilo approves, and matching test cases are added.
- Never promoted automatically: compensation, eligibility decisions, complaints, refunds, licensing dates/fees/documents beyond approved entries, individual cases.

## Open items
- Start the weekly loop after 2026-11-13.

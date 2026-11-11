# GIA MVP 01 engagement port (waiting on C1)

C1 is building `c1/mvp01-journey` and will publish `docs/mvp01/interfaces.md` with migration 0008. GIA does **not** create that schema.

Until C1 lands the interface, GIA emits engagement events through `lib/gia/engagement.mjs`:

| Kind | When |
|---|---|
| `gia.conversation_started` | First GIA turn for a candidate (deduped) |
| `gia.fl_interest` | Approved Financial Literacy answer or next-step recommendation |
| `gia.fep_guidance` | FEP FAQ or `list_fep_sessions` |
| `gia.fep_booking` | Successful `book_fep` |
| `gia.handoff_requested` | `request_leader` / leader escalation |
| `gia.stop` | STOP / `opt_out` |

The memory port always records. When a consented candidate exists, the same kinds are appended to existing `candidate_events` (actor `gia`). Swap the port when C1 publishes the timeline sink. Do not add a G1-owned 0008.

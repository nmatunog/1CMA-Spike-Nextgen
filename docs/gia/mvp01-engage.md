# GIA MVP 01 engagement port

Aligned to C1 `docs/mvp01/interfaces.md` @ `eefc126`. Consented GIA sessions write through `recordGiaVisitorEngagement` / `recordGiaVisitorEngagementOn` onto 0008 `candidate_events`. G1 does **not** call `POST /api/recruitment/command/engagement`.

Payload: `{ candidateId, kind, actor: 'gia', metadata }` with string `intent` / `citation` ≤ 80.

| kind | G1 emits? | When |
|---|---|---|
| `gia.conversation` | yes | After a GIA chat turn that is not a tool confirmation. |
| `gia.handoff` | yes | After `request_leader` / handoff insert. Idempotent per candidate. |
| `literacy.interest` | yes | Visitor asks about free Financial Literacy and is not STOP'd. |
| `fep.booked` | yes | After successful `book_fep`. Idempotent per candidate. |
| `fep.attended` | **no** | Leader marks attendance. G1 refuses this kind. |

`emitGiaEngagement` runs `spec.metadata` through the same intent/citation allowlist as C1. Extra keys, emails, phones, and OTP/code-shaped tokens (4+ digit runs) are dropped. `engagementPort().list()` requires an identity or candidateId.

Scope: the GIA session may write only its bound candidate. A mismatched `candidateId` is `out_of_scope`.

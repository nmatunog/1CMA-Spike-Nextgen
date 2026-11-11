# GIA MVP 01 engagement port

Aligned to C1 `docs/mvp01/interfaces.md` @ `f8d6e5f` (`GiaEngagementEventInput`). C1's `c1/mvp01-journey` is Q1-blocked on an engagement-route IDOR, so G1 does **not** rebase onto C1, does **not** apply `0008`, and does **not** call `POST /api/recruitment/command/engagement`.

The adapter in `lib/gia/engagement.mjs` stays swappable. Until C1's ingest is safe, it records in memory and, when the GIA session already owns a candidate, appends to existing `candidate_events` (actor `gia`).

Payload shape: `{ candidateId, kind, actor: 'gia', metadata }`.

| kind | G1 emits? | When |
|---|---|---|
| `gia.conversation` | yes | After a GIA chat turn that is not a tool confirmation. Metadata `{ intent, citation? }` only. Never raw chat. |
| `gia.handoff` | yes | After `request_leader` / handoff insert. Idempotent per candidate. |
| `literacy.interest` | yes | Visitor asks about free Financial Literacy and is not STOP'd. |
| `fep.booked` | yes | After successful `book_fep`. Idempotent per candidate (Command Center also writes this kind). |
| `fep.attended` | **no** | Leader marks attendance. G1 refuses this kind. |

Metadata allowlist: `intent`, `citation.id`, `citation.version`, `citation.source`. Messages, emails, phones, OTP codes, and other keys are dropped.

Scope: the GIA session identity may write only its bound candidate. An explicit `candidateId` that does not match is `out_of_scope` and nothing is written.

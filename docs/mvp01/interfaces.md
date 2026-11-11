# MVP 01 interfaces (C1 → G1)

Schema owner: Command Center (`migrations/0008_mvp01_journey.sql`).  
TypeScript: `lib/mvp01/interfaces.ts`. Synthetic data only. No autonomous outbound.

Entities stay distinct. Never collapse them into one row or reuse a candidate id as an account id.

```
Candidate  →  UserAccount  →  ProgramEnrollment  →  ProgramRole
```

| Entity | Table | Created by MVP 01 journey? |
|---|---|---|
| Candidate | `candidates` | Yes — capture/register |
| UserAccount | `user_accounts` | No — `provisionUserAccount()` only when a login is required |
| ProgramEnrollment | `program_enrollments` | No — `enrollAccount()` later (literacy/FEP interest is an event, not enrollment) |
| ProgramRole | `program_roles` | No — `assignProgramRole()` later |

A candidate may have **at most one** user account (`user_accounts.candidate_id` UNIQUE). Do not attach a second unrelated identity.

## Capture

`captureProspect(sql, actor, input: CaptureInput): Promise<CaptureResult>`

- Staff-authenticated. Admin-only for MVP 01.
- Fields: name, email/phone, source, campaign, explicit consent + notice version, per-channel prefs (`email` / `sms` / `voice` / `gia`).
- Unchecked consent stores **consent unknown**. CSV import never writes a consent row and always reports `unknown`.
- STOP identities are rejected (`suppressed`).
- Duplicate phone/email/name is flagged; the new candidate is still created (no silent drop, no silent merge).

### Stubs (throw `not_implemented`)

```ts
importVersaLead(input: VersaLeadImport): Promise<CaptureResult>
giaAssistedIntake(input: GiaAssistedIntake): Promise<CaptureResult>
```

G1 should keep calling `captureProspect` after visitor consent on `/gia` (existing path) or wait for `giaAssistedIntake` in a later slice. Do not infer consent from a GIA chat turn alone.

## Register

Canonical candidate columns used by the Command Center:

- `id`, `name` / `name_normalized`, `email` / `phone` (+ verified flags)
- `source` via `candidate_identities`, `campaign`, `capture_channel`
- `registered_at`, `assigned_leader`, `stage`, `next_action`, `due_at`
- append-only `candidate_events` + `command_audit_events`

Duplicate review: `resolveDuplicate(sql, actor, { flagId, action, keeperId? })`

| action | Effect |
|---|---|
| `keep` | `needs_review` → `dismissed`. Both records stay. |
| `link` | `needs_review` → `linked`. Related, not merged. |
| `merge` | Allowed only if the match is a **verified** email/phone. Loser gets `merged_into = keeper`. STOP records cannot merge. |

Dashboard `duplicatePairs` counts distinct unordered pairs still in `needs_review`.

## Evaluate

Config table: `evaluation_form_configs`. Active seed: `mvp01-recruitment` v1 (background, education, motivation, program interest, readiness, observations, human outcome, recommended next action).

`submitEvaluation(sql, actor, input: EvaluationSubmitInput)`

- Renders and validates from config, not from hard-coded field lists in the UI.
- No scoring. GIA text in the timeline is labeled **not a decision**.
- Always writes `candidates.next_action` from `recommended_next_action` and a +24h Asia/Manila due date when none exists.
- STOP blocks evaluation (it would create follow-up).

`GET /api/recruitment/command/evaluation-config` returns the active form.  
`POST /api/recruitment/command/evaluate` accepts `{ id, configId, configVersion, answers }`.

## Engage

`ingestGiaEngagementEvent(sql, input: GiaEngagementEventInput)`

Allowed `kind` values (append-only `candidate_events`):

| kind | When G1 should emit |
|---|---|
| `gia.conversation` | After a GIA turn that is not a tool confirmation (metadata: `{ intent, citation? }`, never raw chat) |
| `gia.handoff` | After `request_leader` / existing handoff insert |
| `literacy.interest` | Visitor asks about free Financial Literacy and is not STOP'd |
| `fep.booked` | After a successful `book_fep` (Command Center also emits this on stage change) |
| `fep.attended` | Leader marks attendance |

Metadata must not include messages, emails, phones, or OTP codes. Duplicate tool events should be idempotent on G1's side; C1 inserts another row if called twice.

HTTP (staff / synthetic): `POST /api/recruitment/command/engagement` with `{ candidateId, kind, metadata }`.

STOP (`opt_out` / `gia_suppressions`) blocks follow-up PATCH, evaluation, duplicate merge, and any future outbound helper `canMessage(candidate, channel)`. Inbound GIA conversation events may still be recorded. There is **no** mail/SMS sender in this slice.

## Outbound helper

```ts
canMessage(state: { stopped: boolean; consent: ConsentState; prefs: Record<CommChannel, boolean> }, channel: CommChannel): boolean
```

True only when not stopped, consent is `granted`, and that channel preference is allowed. MVP 01 never calls a sender.

## Dates

Follow-up due values are Asia/Manila `datetime-local` strings converted with `parseManilaDateTimeLocal` (`UTC+08`, no DST). Overdue = `due_at < now()` and stage not `opt_out` / `disqualified` / `activated`. Dashboard event windows use `manilaDayBounds`.

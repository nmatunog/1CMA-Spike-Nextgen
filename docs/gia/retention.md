# GIA retention configuration

Owner decision (NEXO #27 §8): transcripts 24 months after last contact; audit trail for the life of the record; suppression indefinite.

This is **configuration and documentation only**. No purge, delete, or anonymization job is installed, and none may be run against real candidate data from this change.

| Record | Store | Retain | Destructive jobs |
|---|---|---|---|
| Transcripts (structured turns; no uploads, no OTP codes) | `gia_turns.message_text` | 24 months after last contact | Forbidden |
| Audit (intent, citation, tool, outcome) | `candidate_events`, `gia_turns` | Life of the candidate/workflow record | Forbidden |
| STOP / suppression | `gia_suppressions` | Indefinite | Forbidden |

`migrations/0003_gia_otp_turns_retention.sql` writes the same policy into `gia_retention_config`. Runtime constants live in `lib/gia/retention.mjs`.

Chat file uploads are discarded at the API and are never inserted into transcript or audit payloads. Documents belong only in iRecruit or with the person's leader.

C1 global STOP (`lib/recruitment/suppression`, when added) must keep suppression indefinite. GIA `opt_out` continues to call the existing repository suppression path until that seam is wired.

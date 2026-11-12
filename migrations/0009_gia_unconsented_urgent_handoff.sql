-- Unconsented crisis handoffs: reason urgent, visitor id, program, timestamp.
-- No message text and no PII. Do not edit 0001-0008.
BEGIN;

ALTER TABLE candidate_handoffs ALTER COLUMN candidate_id DROP NOT NULL;
ALTER TABLE candidate_handoffs ADD COLUMN IF NOT EXISTS consented boolean NOT NULL DEFAULT true;
ALTER TABLE candidate_handoffs ADD COLUMN IF NOT EXISTS program text;
ALTER TABLE candidate_handoffs ADD COLUMN IF NOT EXISTS visitor_identity text;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_visitor_handoff
  ON candidate_handoffs(visitor_identity, reason)
  WHERE state IN ('open','acknowledged') AND visitor_identity IS NOT NULL AND consented = false;

COMMIT;

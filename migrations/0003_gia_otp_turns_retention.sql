-- GIA OTP challenges, turn/transcript audit, and retention config.
-- Additive only. No destructive jobs. Do not apply to production candidate data.
BEGIN;

CREATE TABLE IF NOT EXISTS gia_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  destination_hash text NOT NULL,
  channel text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gia_otp_identity_idx ON gia_otp_challenges(identity, created_at DESC);

CREATE TABLE IF NOT EXISTS gia_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  candidate_id uuid REFERENCES candidates(id),
  action text NOT NULL,
  intent text,
  reason text,
  citation jsonb,
  outcome text NOT NULL,
  message_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gia_turns_identity_idx ON gia_turns(identity, created_at);
CREATE INDEX IF NOT EXISTS gia_turns_candidate_idx ON gia_turns(candidate_id, created_at);

CREATE OR REPLACE FUNCTION prevent_gia_turn_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'gia_turns is append-only'; END;
$$;
DROP TRIGGER IF EXISTS protect_gia_turns ON gia_turns;
CREATE TRIGGER protect_gia_turns BEFORE UPDATE OR DELETE ON gia_turns FOR EACH ROW EXECUTE FUNCTION prevent_gia_turn_mutation();

CREATE TABLE IF NOT EXISTS gia_retention_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  notes text NOT NULL
);
INSERT INTO gia_retention_config(key, value, notes) VALUES
  ('transcripts_after_last_contact', '24 months', 'gia_turns.message_text retained 24 months after last contact. Config only; no purge job.'),
  ('audit', 'life_of_record', 'candidate_events and gia_turns audit columns retained for the life of the record.'),
  ('suppression', 'indefinite', 'gia_suppressions retained indefinitely. C1 global STOP must not add a destructive undo/purge.'),
  ('destructive_jobs', 'forbidden', 'No DELETE/UPDATE retention jobs against real or synthetic candidate data from this migration.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE gia_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE gia_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gia_retention_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gia_otp_challenges, gia_turns, gia_retention_config FROM PUBLIC;

COMMIT;

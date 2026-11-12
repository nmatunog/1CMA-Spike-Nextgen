-- CC-02b: CSV intake/export, verified-contact merge, Versa lead mapping.
-- G1 should use migrations/0003_* for GIA-owned schema. Additive; review in staging first.
BEGIN;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone_normalized text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS program_interest text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS versa_lead_ref text;

UPDATE candidates SET email_normalized = NULLIF(lower(trim(email)), '') WHERE email_normalized IS NULL;
UPDATE candidates SET phone_normalized = NULLIF(regexp_replace(phone, '[^0-9+]', '', 'g'), '') WHERE phone_normalized IS NULL;

CREATE OR REPLACE FUNCTION sync_candidate_contacts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email_normalized := NULLIF(lower(trim(COALESCE(NEW.email, ''))), '');
  NEW.phone_normalized := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '[^0-9+]', '', 'g'), '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_candidate_contacts ON candidates;
CREATE TRIGGER sync_candidate_contacts BEFORE INSERT OR UPDATE OF email, phone ON candidates
  FOR EACH ROW EXECUTE FUNCTION sync_candidate_contacts();

CREATE UNIQUE INDEX IF NOT EXISTS candidates_verified_email_idx
  ON candidates(email_normalized) WHERE email_verified AND email_normalized IS NOT NULL AND email_normalized <> '';
CREATE UNIQUE INDEX IF NOT EXISTS candidates_verified_phone_idx
  ON candidates(phone_normalized) WHERE phone_verified AND phone_normalized IS NOT NULL AND phone_normalized <> '';
CREATE INDEX IF NOT EXISTS candidates_email_normalized_idx ON candidates(email_normalized);
CREATE INDEX IF NOT EXISTS candidates_phone_normalized_idx ON candidates(phone_normalized);

CREATE TABLE IF NOT EXISTS versa_lead_map (
  versa_lead_ref text PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  spike_learner_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS versa_lead_map_candidate_idx ON versa_lead_map(candidate_id);

CREATE TABLE IF NOT EXISTS candidate_duplicate_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  left_candidate_id uuid NOT NULL REFERENCES candidates(id),
  right_candidate_id uuid NOT NULL REFERENCES candidates(id),
  match_on text NOT NULL CHECK (match_on IN ('email','phone')),
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_candidate_id <> right_candidate_id),
  UNIQUE (left_candidate_id, right_candidate_id, match_on)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_sha256 text NOT NULL UNIQUE,
  actor text NOT NULL,
  filename text NOT NULL,
  accepted integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  flagged integer NOT NULL DEFAULT 0,
  merged integer NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION prevent_command_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'command_audit_events is append-only'; END;
$$;
DROP TRIGGER IF EXISTS protect_command_audit ON command_audit_events;
CREATE TRIGGER protect_command_audit BEFORE UPDATE OR DELETE ON command_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_command_audit_mutation();

ALTER TABLE versa_lead_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE versa_lead_map FORCE ROW LEVEL SECURITY;
ALTER TABLE candidate_duplicate_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_duplicate_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE command_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON versa_lead_map, candidate_duplicate_flags, import_batches, command_audit_events FROM PUBLIC;
DROP POLICY IF EXISTS versa_lead_map_owner_all ON versa_lead_map;
CREATE POLICY versa_lead_map_owner_all ON versa_lead_map USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS candidate_duplicate_flags_owner_all ON candidate_duplicate_flags;
CREATE POLICY candidate_duplicate_flags_owner_all ON candidate_duplicate_flags USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS import_batches_owner_all ON import_batches;
CREATE POLICY import_batches_owner_all ON import_batches USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS command_audit_events_owner_all ON command_audit_events;
CREATE POLICY command_audit_events_owner_all ON command_audit_events USING (true) WITH CHECK (true);
COMMIT;

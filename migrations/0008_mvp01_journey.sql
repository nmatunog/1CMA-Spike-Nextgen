-- MVP 01 Capture → Register → Evaluate → Engage.
-- Do not edit 0001-0007. gia_app least privilege; owner_all scoped to the table owner.
BEGIN;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS campaign text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS name_normalized text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS registered_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS capture_channel text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES candidates(id);

UPDATE candidates SET registered_at = COALESCE(registered_at, created_at, now());
UPDATE candidates SET capture_channel = COALESCE(NULLIF(capture_channel, ''), 'manual');
UPDATE candidates SET name_normalized = NULLIF(lower(regexp_replace(trim(COALESCE(name, '')), '\s+', ' ', 'g')), '');

ALTER TABLE candidates ALTER COLUMN registered_at SET DEFAULT now();
ALTER TABLE candidates ALTER COLUMN registered_at SET NOT NULL;
ALTER TABLE candidates ALTER COLUMN capture_channel SET DEFAULT 'manual';
ALTER TABLE candidates ALTER COLUMN capture_channel SET NOT NULL;

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_capture_channel_chk;
ALTER TABLE candidates ADD CONSTRAINT candidates_capture_channel_chk
  CHECK (capture_channel IN ('manual','csv','versa_stub','gia_stub','gia_web_session'));
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_merged_into_chk;
ALTER TABLE candidates ADD CONSTRAINT candidates_merged_into_chk CHECK (merged_into IS NULL OR merged_into <> id);

CREATE OR REPLACE FUNCTION sync_candidate_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.name_normalized := NULLIF(lower(regexp_replace(trim(COALESCE(NEW.name, '')), '\s+', ' ', 'g')), '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_candidate_name ON candidates;
CREATE TRIGGER sync_candidate_name BEFORE INSERT OR UPDATE OF name ON candidates
  FOR EACH ROW EXECUTE FUNCTION sync_candidate_name();

CREATE INDEX IF NOT EXISTS candidates_name_normalized_idx ON candidates(name_normalized);
CREATE INDEX IF NOT EXISTS candidates_registered_at_idx ON candidates(registered_at);
CREATE INDEX IF NOT EXISTS candidates_merged_into_idx ON candidates(merged_into);

CREATE TABLE IF NOT EXISTS candidate_channel_prefs (
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  channel text NOT NULL CHECK (channel IN ('email','sms','voice','gia')),
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, channel)
);

CREATE TABLE IF NOT EXISTS user_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES user_accounts(id),
  program_code text NOT NULL CHECK (program_code IN ('literacy','fep','ra_spike','intern')),
  status text NOT NULL DEFAULT 'interested' CHECK (status IN ('interested','enrolled','completed','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, program_code)
);

CREATE TABLE IF NOT EXISTS program_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES program_enrollments(id),
  role_code text NOT NULL CHECK (role_code IN ('learner','intern','advisor_track')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, role_code)
);

CREATE TABLE IF NOT EXISTS evaluation_form_configs (
  id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  sections jsonb NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS candidate_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  config_id text NOT NULL,
  config_version integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  outcome text NOT NULL,
  recommended_next_action text NOT NULL,
  evaluator text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (config_id, config_version) REFERENCES evaluation_form_configs(id, version)
);

CREATE OR REPLACE FUNCTION prevent_evaluation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'candidate_evaluations is append-only'; END;
$$;
DROP TRIGGER IF EXISTS protect_candidate_evaluations ON candidate_evaluations;
CREATE TRIGGER protect_candidate_evaluations BEFORE UPDATE OR DELETE ON candidate_evaluations
  FOR EACH ROW EXECUTE FUNCTION prevent_evaluation_mutation();
DROP TRIGGER IF EXISTS protect_candidate_evaluations_truncate ON candidate_evaluations;
CREATE TRIGGER protect_candidate_evaluations_truncate BEFORE TRUNCATE ON candidate_evaluations
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evaluation_mutation();

INSERT INTO evaluation_form_configs(id, version, title, active, sections) VALUES (
  'mvp01-recruitment',
  1,
  'MVP 01 recruitment evaluation',
  true,
  $eval$[
    {"id":"background","title":"Background","fields":[{"id":"background","label":"Background","type":"textarea","required":true,"maxLength":1000}]},
    {"id":"education","title":"Education","fields":[{"id":"education","label":"Education","type":"textarea","required":true,"maxLength":1000}]},
    {"id":"motivation","title":"Career interests / motivation","fields":[{"id":"motivation","label":"Career interests / motivation","type":"textarea","required":true,"maxLength":1000}]},
    {"id":"program","title":"Program interest","fields":[{"id":"program_interest","label":"Program interest","type":"select","required":true,"options":[{"value":"literacy","label":"Financial Literacy (free)"},{"value":"fep","label":"FEP (free)"},{"value":"ra_spike","label":"RA-SPIKE"},{"value":"intern","label":"SPIKE for Interns"},{"value":"undecided","label":"Undecided"}]}]},
    {"id":"readiness","title":"Availability / readiness","fields":[{"id":"readiness","label":"Availability / readiness","type":"textarea","required":true,"maxLength":500}]},
    {"id":"interview","title":"Interview observations","fields":[{"id":"observations","label":"Interview observations","type":"textarea","required":false,"maxLength":1000}]},
    {"id":"decision","title":"Human outcome","fields":[{"id":"outcome","label":"Outcome","type":"select","required":true,"options":[{"value":"proceed","label":"Proceed"},{"value":"hold","label":"Hold"},{"value":"not_now","label":"Not now"},{"value":"disqualified","label":"Disqualified"}]},{"id":"recommended_next_action","label":"Recommended next action","type":"select","required":true,"options":[{"value":"fep","label":"Book / attend FEP"},{"value":"literacy","label":"Financial Literacy"},{"value":"leader_conversation","label":"Leader conversation"},{"value":"follow_up","label":"Follow-up"}]}]}
  ]$eval$::jsonb
) ON CONFLICT (id, version) DO NOTHING;

ALTER TABLE candidate_duplicate_flags DROP CONSTRAINT IF EXISTS candidate_duplicate_flags_match_on_check;
ALTER TABLE candidate_duplicate_flags ADD CONSTRAINT candidate_duplicate_flags_match_on_check
  CHECK (match_on IN ('email','phone','name'));
ALTER TABLE candidate_duplicate_flags DROP CONSTRAINT IF EXISTS candidate_duplicate_flags_status_check;
ALTER TABLE candidate_duplicate_flags ADD CONSTRAINT candidate_duplicate_flags_status_check
  CHECK (status IN ('needs_review','dismissed','linked','merged'));

DO $$
DECLARE
  t text;
  owner_role text := current_user;
  tables text[] := ARRAY[
    'candidate_channel_prefs',
    'user_accounts',
    'program_enrollments',
    'program_roles',
    'evaluation_form_configs',
    'candidate_evaluations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM gia_app', t);
    BEGIN EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t); EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', t); EXCEPTION WHEN undefined_object THEN NULL; END;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_gia_app', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO gia_app USING (true) WITH CHECK (true)',
      t || '_gia_app', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      t || '_owner_all', t, owner_role
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON candidate_channel_prefs TO gia_app;
GRANT SELECT ON user_accounts TO gia_app;
GRANT SELECT ON program_enrollments TO gia_app;
GRANT SELECT ON program_roles TO gia_app;
GRANT SELECT ON evaluation_form_configs TO gia_app;
GRANT SELECT, INSERT ON candidate_evaluations TO gia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gia_app;

COMMIT;

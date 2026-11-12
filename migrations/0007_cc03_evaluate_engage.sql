-- CC-03: preliminary human evaluation + engagement outcome (no L1/L2 redesign).
-- Q1 Lows from the 0006 review: TRUNCATE block, default sequence privileges,
-- and owner-scoped satellite *_owner_all policies. Do not edit 0001-0006.
BEGIN;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS evaluation_next_step text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS evaluated_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS evaluated_by text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_engaged_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_engagement_outcome text;

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_evaluation_next_step_chk;
ALTER TABLE candidates ADD CONSTRAINT candidates_evaluation_next_step_chk
  CHECK (evaluation_next_step IS NULL OR evaluation_next_step IN ('fep','literacy','leader_conversation','follow_up'));
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_engagement_outcome_chk;
ALTER TABLE candidates ADD CONSTRAINT candidates_engagement_outcome_chk
  CHECK (last_engagement_outcome IS NULL OR last_engagement_outcome IN ('reached','no_answer','rescheduled','declined','completed'));

CREATE INDEX IF NOT EXISTS candidates_evaluated_at_idx ON candidates(evaluated_at);
CREATE INDEX IF NOT EXISTS candidates_last_engaged_at_idx ON candidates(last_engaged_at);

-- Append-only: block TRUNCATE as well as UPDATE/DELETE (0001/0004 already cover row mutations).
DROP TRIGGER IF EXISTS protect_candidate_events_truncate ON candidate_events;
CREATE TRIGGER protect_candidate_events_truncate
  BEFORE TRUNCATE ON candidate_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_candidate_event_mutation();

DROP TRIGGER IF EXISTS protect_command_audit_truncate ON command_audit_events;
CREATE TRIGGER protect_command_audit_truncate
  BEFORE TRUNCATE ON command_audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_command_audit_mutation();

-- Future sequences created by this owner inherit gia_app USAGE/SELECT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gia_app;

-- Scope satellite (and matching CSV/OTP) owner_all policies to the table owner.
-- gia_app keeps the explicit *_gia_app policies from 0006. Unscoped USING(true)
-- would otherwise apply to PUBLIC.
DO $$
DECLARE
  t text;
  owner_role text := current_user;
  tables text[] := ARRAY[
    'candidate_identities',
    'candidate_consents',
    'candidate_events',
    'candidate_handoffs',
    'gia_suppressions',
    'fep_sessions',
    'fep_bookings',
    'versa_lead_map',
    'import_batches',
    'command_audit_events',
    'candidate_duplicate_flags',
    'gia_otp_challenges',
    'gia_otp_throttle',
    'gia_turns',
    'gia_retention_config',
    'landing_quiz_results',
    'candidates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_all', t);
    IF t = 'gia_retention_config' THEN
      EXECUTE 'DROP POLICY IF EXISTS gia_retention_owner_all ON gia_retention_config';
    END IF;
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      CASE WHEN t = 'gia_retention_config' THEN 'gia_retention_owner_all' ELSE t || '_owner_all' END,
      t, owner_role
    );
  END LOOP;
END
$$;

COMMIT;

-- CC-02a: literacy / SPIKE-paid attributes, queue indexes, irreversible STOP.
-- G1 should use migrations/0003_* for GIA-owned schema. Additive; review in staging first.
BEGIN;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS literacy_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS spike_paid boolean NOT NULL DEFAULT false;
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_literacy_status_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_literacy_status_check
  CHECK (literacy_status IN ('not_started','enrolled','engaged','completed'));

CREATE INDEX IF NOT EXISTS candidates_stage_idx ON candidates(stage);
CREATE INDEX IF NOT EXISTS candidates_assigned_leader_idx ON candidates(assigned_leader);
CREATE INDEX IF NOT EXISTS candidates_due_at_idx ON candidates(due_at);
CREATE INDEX IF NOT EXISTS candidate_identities_candidate_id_idx ON candidate_identities(candidate_id);
CREATE INDEX IF NOT EXISTS candidate_events_kind_created_idx ON candidate_events(kind, created_at);
CREATE INDEX IF NOT EXISTS candidate_events_candidate_idx ON candidate_events(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS candidate_handoffs_state_idx ON candidate_handoffs(state, escalate_at);

CREATE OR REPLACE FUNCTION prevent_opt_out_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.stage = 'opt_out' AND NEW.stage IS DISTINCT FROM 'opt_out' THEN
    RAISE EXCEPTION 'suppressed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_opt_out ON candidates;
CREATE TRIGGER protect_opt_out BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION prevent_opt_out_reactivation();

-- Q1 #6: 0001 enabled RLS on candidates but did not REVOKE PUBLIC or FORCE RLS.
REVOKE ALL ON candidates FROM PUBLIC;
DO $$
BEGIN
  BEGIN EXECUTE 'REVOKE ALL ON candidates FROM anon'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON candidates FROM authenticated'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;
ALTER TABLE candidates FORCE ROW LEVEL SECURITY;
-- Owner/app access after FORCE RLS. Client roles remain revoked above.
DROP POLICY IF EXISTS candidates_owner_all ON candidates;
CREATE POLICY candidates_owner_all ON candidates USING (true) WITH CHECK (true);

-- Public DNA-quiz intake is isolated from the recruitment Command Center.
CREATE TABLE IF NOT EXISTS landing_quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  score integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE landing_quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_quiz_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON landing_quiz_results FROM PUBLIC;
DROP POLICY IF EXISTS landing_quiz_results_owner_all ON landing_quiz_results;
CREATE POLICY landing_quiz_results_owner_all ON landing_quiz_results USING (true) WITH CHECK (true);
COMMIT;

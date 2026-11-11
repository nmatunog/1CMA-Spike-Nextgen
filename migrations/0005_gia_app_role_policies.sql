-- Q1 residual: FORCE RLS needs an explicit app/owner ALLOW policy plus GRANTs
-- (matching 0002's candidates_owner_all). Also REVOKE anon/authenticated on
-- CC-02b 0004 tables, matching 0002/0003. CC-02b owns 0004, so this is 0005.
BEGIN;

DO $$
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gia_app') THEN
      CREATE ROLE gia_app NOLOGIN NOBYPASSRLS;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

-- Owner/app access after FORCE RLS. Client roles remain revoked.
REVOKE ALL ON gia_otp_challenges, gia_otp_throttle, gia_turns, gia_retention_config FROM PUBLIC;
DO $$
BEGIN
  BEGIN EXECUTE 'REVOKE ALL ON gia_otp_challenges, gia_otp_throttle, gia_turns, gia_retention_config FROM anon'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON gia_otp_challenges, gia_otp_throttle, gia_turns, gia_retention_config FROM authenticated'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

DROP POLICY IF EXISTS gia_otp_challenges_owner_all ON gia_otp_challenges;
CREATE POLICY gia_otp_challenges_owner_all ON gia_otp_challenges USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS gia_otp_throttle_owner_all ON gia_otp_throttle;
CREATE POLICY gia_otp_throttle_owner_all ON gia_otp_throttle USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS gia_turns_owner_all ON gia_turns;
CREATE POLICY gia_turns_owner_all ON gia_turns USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS gia_retention_owner_all ON gia_retention_config;
CREATE POLICY gia_retention_owner_all ON gia_retention_config USING (true) WITH CHECK (true);

DO $$
BEGIN
  BEGIN
    GRANT ALL ON gia_otp_challenges, gia_otp_throttle, gia_turns, gia_retention_config TO gia_app;
    EXECUTE 'GRANT USAGE ON SCHEMA public TO gia_app';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END
$$;

-- 0004 enabled FORCE RLS and owner_all on CSV tables but did not REVOKE anon/authenticated.
DO $$
BEGIN
  BEGIN EXECUTE 'REVOKE ALL ON versa_lead_map, import_batches, command_audit_events, candidate_duplicate_flags FROM anon'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON versa_lead_map, import_batches, command_audit_events, candidate_duplicate_flags FROM authenticated'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

COMMIT;

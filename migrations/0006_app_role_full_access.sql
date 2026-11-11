-- Q1 HIGH: gia_app must be able to run GIA + Command Center SQL under
-- FORCE RLS with least-privilege GRANTs. Do not edit 0001-0005.
-- 0005 GRANT ALL on the four OTP/turns tables is revoked and replaced here.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gia_app') THEN
    CREATE ROLE gia_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO gia_app;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'candidates',
    'candidate_identities',
    'candidate_consents',
    'candidate_events',
    'candidate_handoffs',
    'gia_suppressions',
    'fep_sessions',
    'fep_bookings',
    'landing_quiz_results',
    'versa_lead_map',
    'import_batches',
    'command_audit_events',
    'candidate_duplicate_flags',
    'gia_otp_challenges',
    'gia_otp_throttle',
    'gia_turns',
    'gia_retention_config'
  ];
  satellite text[] := ARRAY[
    'candidate_identities',
    'candidate_consents',
    'candidate_events',
    'candidate_handoffs',
    'gia_suppressions',
    'fep_sessions',
    'fep_bookings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_gia_app', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO gia_app USING (true) WITH CHECK (true)',
      t || '_gia_app', t
    );
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM gia_app', t);
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t);
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', t);
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END LOOP;

  -- 0001 enabled RLS on satellites but did not FORCE or add an ALLOW policy.
  FOREACH t IN ARRAY satellite LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (true) WITH CHECK (true)',
      t || '_owner_all', t
    );
  END LOOP;
END
$$;

-- Least privilege. Never TRUNCATE. DELETE only on landing_quiz_results (admin quiz route).
GRANT SELECT, INSERT, UPDATE ON candidates TO gia_app;
GRANT SELECT, INSERT ON candidate_identities TO gia_app;
GRANT SELECT, INSERT, UPDATE ON candidate_consents TO gia_app;
GRANT SELECT, INSERT ON candidate_events TO gia_app;
GRANT SELECT, INSERT, UPDATE ON candidate_handoffs TO gia_app;
GRANT SELECT, INSERT ON gia_suppressions TO gia_app;
GRANT SELECT, UPDATE ON fep_sessions TO gia_app;
GRANT SELECT, INSERT ON fep_bookings TO gia_app;
GRANT SELECT, INSERT, DELETE ON landing_quiz_results TO gia_app;
GRANT SELECT, INSERT, UPDATE ON versa_lead_map TO gia_app;
GRANT SELECT, INSERT ON import_batches TO gia_app;
GRANT SELECT, INSERT ON command_audit_events TO gia_app;
GRANT SELECT, INSERT, UPDATE ON candidate_duplicate_flags TO gia_app;
GRANT SELECT, INSERT, UPDATE ON gia_otp_challenges TO gia_app;
GRANT SELECT, INSERT, UPDATE ON gia_otp_throttle TO gia_app;
GRANT SELECT, INSERT ON gia_turns TO gia_app;
GRANT SELECT ON gia_retention_config TO gia_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gia_app;

COMMIT;

-- Local GIA rate windows. Hashed buckets only; no raw IP or message text.
-- Do not edit 0001-0009.
BEGIN;

CREATE TABLE IF NOT EXISTS gia_rate_windows (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

DO $$
DECLARE
  owner_role text := current_user;
BEGIN
  EXECUTE 'ALTER TABLE gia_rate_windows ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE gia_rate_windows FORCE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE gia_rate_windows FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE gia_rate_windows FROM gia_app';
  BEGIN EXECUTE 'REVOKE ALL ON TABLE gia_rate_windows FROM anon'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON TABLE gia_rate_windows FROM authenticated'; EXCEPTION WHEN undefined_object THEN NULL; END;
  EXECUTE 'DROP POLICY IF EXISTS gia_rate_windows_gia_app ON gia_rate_windows';
  EXECUTE 'CREATE POLICY gia_rate_windows_gia_app ON gia_rate_windows FOR ALL TO gia_app USING (true) WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS gia_rate_windows_owner_all ON gia_rate_windows';
  EXECUTE format('CREATE POLICY gia_rate_windows_owner_all ON gia_rate_windows FOR ALL TO %I USING (true) WITH CHECK (true)', owner_role);
END
$$;

GRANT SELECT, INSERT, UPDATE ON gia_rate_windows TO gia_app;

COMMIT;

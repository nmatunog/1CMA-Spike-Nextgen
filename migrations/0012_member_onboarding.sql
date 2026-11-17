-- Draft only. Apply to local synthetic databases; live placement/grants require review.
BEGIN;
CREATE TABLE IF NOT EXISTS member_handoffs (
  key_hash text PRIMARY KEY, payload jsonb NOT NULL, verified_at timestamptz,
  expires_at timestamptz NOT NULL, claimed_by uuid REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_credentials (
  account_id uuid PRIMARY KEY REFERENCES user_accounts(id), email text NOT NULL UNIQUE,
  password_salt text NOT NULL, password_hash text NOT NULL,
  email_verified_at timestamptz NOT NULL, auth_version integer NOT NULL DEFAULT 1,
  CHECK (email = lower(trim(email)))
);
CREATE TABLE IF NOT EXISTS member_pending_signups (
  handoff_key text PRIMARY KEY REFERENCES member_handoffs(key_hash) ON DELETE CASCADE,
  email text NOT NULL, password_salt text NOT NULL, password_hash text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE member_pending_signups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_pending_signups FROM PUBLIC;
CREATE TABLE IF NOT EXISTS member_challenges (
  token_hash text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('verify','reset')),
  handoff_key text REFERENCES member_handoffs(key_hash) ON DELETE CASCADE,
  account_id uuid REFERENCES user_accounts(id), pending_email text, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, prepared_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_handoff_claims (
  handoff_key text PRIMARY KEY, account_id uuid NOT NULL REFERENCES user_accounts(id),
  code_digest text NOT NULL, sponsor_first text NOT NULL, sponsor_last text NOT NULL,
  variable_data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_code_claims (
  code_digest text PRIMARY KEY, account_id uuid NOT NULL REFERENCES user_accounts(id)
);
ALTER TABLE member_code_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_code_claims FROM PUBLIC;
CREATE TABLE IF NOT EXISTS member_rate_limits (
  key_hash text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
-- Local synthetic sink only: no HTTP retrieval endpoint, no real email delivery.
CREATE TABLE IF NOT EXISTS member_local_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), destination text NOT NULL,
  kind text NOT NULL, link text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE member_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_handoff_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_local_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_handoffs,member_credentials,member_challenges,member_handoff_claims,member_rate_limits,member_local_mail FROM PUBLIC;
CREATE TABLE IF NOT EXISTS member_arrival_tickets (
  ticket_hash text PRIMARY KEY, issuer_nonce text NOT NULL UNIQUE, payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz
);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='member_app') THEN CREATE ROLE member_app NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='member_mail_test_reader') THEN CREATE ROLE member_mail_test_reader NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO member_app, member_mail_test_reader;
-- Trusted server role only, never granted to gia_app, anon or authenticated.
GRANT SELECT,INSERT,UPDATE,DELETE ON member_handoffs,member_pending_signups,member_rate_limits,member_arrival_tickets TO member_app;
GRANT SELECT,INSERT,UPDATE ON member_credentials,member_challenges TO member_app;
GRANT SELECT,INSERT ON member_code_claims,member_handoff_claims TO member_app;
GRANT INSERT,DELETE,SELECT(created_at) ON member_local_mail TO member_app;
GRANT SELECT ON member_local_mail TO member_mail_test_reader;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['member_handoffs','member_pending_signups','member_rate_limits','member_arrival_tickets','member_credentials','member_challenges','member_code_claims','member_handoff_claims','member_local_mail'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
    EXECUTE format('CREATE POLICY member_server ON %I TO member_app USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
CREATE POLICY synthetic_mail_reader ON member_local_mail FOR SELECT TO member_mail_test_reader USING (true);
-- Minimal canonical identity access; no program enrollment, role or AIA mutation.
GRANT SELECT(id,email_normalized,email_verified) ON candidates TO member_app;
GRANT INSERT(id,name,email,email_verified,created_at,capture_channel) ON candidates TO member_app;
CREATE POLICY member_candidate_read ON candidates FOR SELECT TO member_app
  USING (email_verified AND email_normalized = NULLIF(current_setting('app.member_email',true),''));
CREATE POLICY member_candidate_create ON candidates FOR INSERT TO member_app
  WITH CHECK (email_verified AND capture_channel='versa_stub'
    AND email_normalized = NULLIF(current_setting('app.member_email',true),'')
    AND id::text = NULLIF(current_setting('app.member_candidate_id',true),''));
-- Request identity is bound by the trusted transaction wrapper before SET LOCAL ROLE.
-- No table-wide reads, active inserts, disabled-row updates, reassignment or deletion.
REVOKE ALL ON user_accounts FROM member_app;
REVOKE UPDATE(candidate_id) ON user_accounts FROM member_app;
GRANT SELECT(id,candidate_id,status),INSERT(id,candidate_id,status),UPDATE(status) ON user_accounts TO member_app;
CREATE POLICY member_account_read ON user_accounts FOR SELECT TO member_app
  USING (id::text = NULLIF(current_setting('app.member_account_id',true),''));
CREATE POLICY member_account_insert ON user_accounts FOR INSERT TO member_app
  WITH CHECK (status='pending'
    AND id::text = NULLIF(current_setting('app.member_account_id',true),'')
    AND candidate_id::text = NULLIF(current_setting('app.member_candidate_id',true),'')
    AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=user_accounts.candidate_id));
CREATE POLICY member_account_activate ON user_accounts FOR UPDATE TO member_app
  USING (status='pending' AND id::text = NULLIF(current_setting('app.member_account_id',true),''))
  WITH CHECK (status='active'
    AND id::text = NULLIF(current_setting('app.member_account_id',true),'')
    AND candidate_id::text = NULLIF(current_setting('app.member_candidate_id',true),'')
    AND EXISTS(SELECT 1 FROM candidates c WHERE c.id=user_accounts.candidate_id));
COMMIT;

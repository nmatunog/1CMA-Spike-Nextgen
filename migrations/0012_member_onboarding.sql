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
  email text PRIMARY KEY, password_salt text NOT NULL, password_hash text NOT NULL,
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
COMMIT;

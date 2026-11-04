-- Additive extension of the existing canonical candidates table. Review in staging first.
BEGIN;
ALTER TABLE candidates ALTER COLUMN email SET DEFAULT '';
ALTER TABLE candidates ALTER COLUMN phone SET DEFAULT '';
ALTER TABLE candidates ALTER COLUMN score SET DEFAULT 0;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new_lead';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assigned_leader text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS due_at timestamptz;
CREATE TABLE IF NOT EXISTS candidate_identities (
  source text NOT NULL, external_id text NOT NULL, candidate_id uuid NOT NULL REFERENCES candidates(id),
  PRIMARY KEY (source, external_id)
);
CREATE TABLE IF NOT EXISTS candidate_consents (
  candidate_id uuid NOT NULL REFERENCES candidates(id), source text NOT NULL, purpose text NOT NULL,
  notice_version text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  PRIMARY KEY(candidate_id,source,purpose)
);
CREATE TABLE IF NOT EXISTS candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES candidates(id),
  kind text NOT NULL, actor text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fep_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), starts_at timestamptz NOT NULL, capacity integer NOT NULL CHECK(capacity > 0),
  cancelled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS fep_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES candidates(id),
  session_id uuid NOT NULL REFERENCES fep_sessions(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id,session_id)
);
CREATE TABLE IF NOT EXISTS candidate_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES candidates(id),
  reason text NOT NULL, urgency text NOT NULL DEFAULT 'normal', state text NOT NULL DEFAULT 'open',
  due_at timestamptz NOT NULL DEFAULT now() + interval '24 hours', escalate_at timestamptz NOT NULL DEFAULT now() + interval '18 hours',
  resolution text, gia_could_answer boolean NOT NULL DEFAULT false, general_answer text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(candidate_id,reason)
);
-- No direct browser/Supabase anonymous access. Server uses its restricted DB role.
CREATE TABLE IF NOT EXISTS gia_suppressions(identity text PRIMARY KEY);
ALTER TABLE gia_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gia_suppressions FROM PUBLIC;
ALTER TABLE candidate_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fep_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON candidate_identities,candidate_consents,candidate_events,fep_sessions,fep_bookings,candidate_handoffs FROM PUBLIC;
COMMIT;

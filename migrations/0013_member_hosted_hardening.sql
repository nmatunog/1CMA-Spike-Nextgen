-- Draft only. No live apply. Private key storage is intentionally EMPTY after migration.
BEGIN;
CREATE SCHEMA member_private;
REVOKE ALL ON SCHEMA member_private FROM PUBLIC,member_app,gia_app,anon,authenticated;
CREATE TABLE member_private.proof_keys(id boolean PRIMARY KEY DEFAULT true CHECK(id),secret text NOT NULL CHECK(secret ~ '^[a-f0-9]{64}$'));
CREATE TABLE member_private.used_proofs(nonce text PRIMARY KEY,expires_at timestamptz NOT NULL);
REVOKE ALL ON ALL TABLES IN SCHEMA member_private FROM PUBLIC,member_app,gia_app,anon,authenticated;
-- HMAC-SHA256 using PostgreSQL core sha256(bytea); no extension dependency.
CREATE FUNCTION member_private.authorize(p jsonb,action text,expected jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE claims jsonb; k bytea; inner_pad bytea:=decode(repeat('36',64),'hex'); outer_pad bytea:=decode(repeat('5c',64),'hex'); actual bytea; supplied bytea; mismatch integer:=0; inserted text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p)<>'object' OR p->>'message' IS NULL OR p->>'mac' IS NULL OR octet_length(p->>'message')>20000 OR (p->>'mac') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  claims:=(p->>'message')::jsonb;
  IF jsonb_typeof(claims)<>'object' OR claims->>'nonce' IS NULL OR claims->>'exp' IS NULL OR claims->>'action' IS DISTINCT FROM action OR claims-'action'-'exp'-'nonce' IS DISTINCT FROM expected
    OR (claims->>'nonce') !~ '^[a-f0-9]{64}$' OR (claims->>'exp') !~ '^\d{13}$'
    OR (claims->>'exp')::bigint <= extract(epoch FROM clock_timestamp())*1000
    OR (claims->>'exp')::bigint > extract(epoch FROM clock_timestamp())*1000+120000 THEN RETURN false; END IF;
  SELECT decode(secret,'hex') INTO k FROM member_private.proof_keys WHERE id;
  IF k IS NULL THEN RETURN false; END IF;
  FOR i IN 0..31 LOOP inner_pad:=set_byte(inner_pad,i,get_byte(inner_pad,i)#get_byte(k,i)); outer_pad:=set_byte(outer_pad,i,get_byte(outer_pad,i)#get_byte(k,i)); END LOOP;
  actual:=sha256(outer_pad || sha256(inner_pad || convert_to(p->>'message','UTF8'))); supplied:=decode(p->>'mac','hex');
  FOR i IN 0..31 LOOP mismatch:=mismatch | (get_byte(actual,i)#get_byte(supplied,i)); END LOOP;
  IF mismatch<>0 THEN RETURN false; END IF;
  DELETE FROM member_private.used_proofs WHERE expires_at < clock_timestamp();
  INSERT INTO member_private.used_proofs(nonce,expires_at) VALUES(claims->>'nonce',to_timestamp((claims->>'exp')::bigint/1000.0)) ON CONFLICT DO NOTHING RETURNING nonce INTO inserted;
  RETURN inserted IS NOT NULL;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION member_private.authorize(jsonb,text,jsonb) FROM PUBLIC,member_app;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='member_runtime') THEN
    CREATE ROLE member_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
-- No password or owner membership. Hosted credential provisioning is a separate hold.
GRANT member_app TO member_runtime;
REVOKE CREATE ON SCHEMA public FROM member_app,member_runtime;

REVOKE ALL ON FUNCTION public.member_create_pending_account(uuid,uuid,text),public.member_activate_account(uuid,uuid),public.member_lookup_challenge(text,text) FROM member_app,PUBLIC;
CREATE FUNCTION public.member_create_pending_account(a uuid,c uuid,e text,h text,p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  IF NOT member_private.authorize(p,'create_account',jsonb_build_object('account',a::text,'candidate',c::text,'email',e,'handoff',h)) THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.member_handoffs x JOIN public.candidates y ON y.id=c
    WHERE x.key_hash=h AND x.verified_at IS NOT NULL AND x.expires_at>clock_timestamp() AND x.claimed_by IS NULL
      AND x.payload->>'me'=e AND y.email_verified AND y.email_normalized=e) THEN RETURN NULL; END IF;
  INSERT INTO public.user_accounts(id,candidate_id,status) VALUES(a,c,'pending') ON CONFLICT(candidate_id) DO NOTHING RETURNING id INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.member_activate_account(a uuid,c uuid,h text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
  IF NOT member_private.authorize(p,'activate_account',jsonb_build_object('account',a::text,'candidate',c::text,'handoff',h)) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.member_handoffs x JOIN public.candidates y ON y.id=c WHERE x.key_hash=h
    AND x.verified_at IS NOT NULL AND x.expires_at>clock_timestamp() AND (x.claimed_by IS NULL OR x.claimed_by=a)
    AND y.email_verified AND y.email_normalized=x.payload->>'me') THEN RETURN false; END IF;
  UPDATE public.user_accounts SET status='active' WHERE id=a AND candidate_id=c AND status='pending' RETURNING id INTO result;
  RETURN result IS NOT NULL;
END $$;
CREATE FUNCTION public.member_lookup_challenge(h text,k text,p jsonb) RETURNS SETOF public.member_challenges
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT member_private.authorize(p,'lookup_challenge',jsonb_build_object('hash',h,'kind',k)) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.member_challenges WHERE token_hash=h AND kind=k AND k IN ('verify','reset') FOR UPDATE;
END $$;

-- The verified flag/payload and ticket payload are immutable to raw member SQL.
REVOKE INSERT,UPDATE,DELETE ON member_handoffs FROM member_app;
REVOKE ALL ON member_arrival_tickets FROM member_app;
DROP POLICY member_server ON member_handoffs;
CREATE POLICY handoff_read ON member_handoffs FOR SELECT TO member_app USING
  (key_hash=NULLIF(current_setting('app.member_handoff_key',true),'') OR payload->>'me'=NULLIF(current_setting('app.member_email',true),''));
DROP POLICY member_server ON member_pending_signups;
CREATE POLICY pending_read ON member_pending_signups FOR SELECT TO member_app USING
  (handoff_key=NULLIF(current_setting('app.member_handoff_key',true),'') OR email=NULLIF(current_setting('app.member_email',true),''));
CREATE POLICY pending_insert ON member_pending_signups FOR INSERT TO member_app WITH CHECK
  (handoff_key=NULLIF(current_setting('app.member_handoff_key',true),'') OR email=NULLIF(current_setting('app.member_email',true),''));
CREATE POLICY pending_update ON member_pending_signups FOR UPDATE TO member_app USING
  (handoff_key=NULLIF(current_setting('app.member_handoff_key',true),'') OR email=NULLIF(current_setting('app.member_email',true),'')) WITH CHECK
  (handoff_key=NULLIF(current_setting('app.member_handoff_key',true),'') OR email=NULLIF(current_setting('app.member_email',true),''));
CREATE POLICY pending_delete ON member_pending_signups FOR DELETE TO member_app USING
  (handoff_key=NULLIF(current_setting('app.member_handoff_key',true),'') OR email=NULLIF(current_setting('app.member_email',true),''));

CREATE FUNCTION public.member_write_handoff(action text,h text,data jsonb,source text,a uuid,exp_ms bigint,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.member_handoffs;
BEGIN
  IF NOT member_private.authorize(p,'handoff_'||action,jsonb_build_object('key',h,'data',data,'source',source,'account',a::text,'expires',exp_ms)) THEN RETURN false; END IF;
  IF action='prepare' THEN
    DELETE FROM public.member_pending_signups WHERE expires_at<=clock_timestamp();
    DELETE FROM public.member_handoffs WHERE expires_at<=clock_timestamp();
    INSERT INTO public.member_handoffs(key_hash,payload,expires_at) VALUES(h,data,to_timestamp(exp_ms/1000.0));
  ELSIF action='rotate' THEN
    SELECT * INTO old FROM public.member_handoffs WHERE key_hash=source FOR UPDATE;
    IF old.key_hash IS NULL OR old.claimed_by IS NOT NULL OR old.expires_at<=clock_timestamp() THEN RETURN false; END IF;
    INSERT INTO public.member_handoffs(key_hash,payload,verified_at,expires_at) VALUES(h,old.payload,clock_timestamp(),to_timestamp(exp_ms/1000.0));
    UPDATE public.member_handoffs SET expires_at=to_timestamp(0) WHERE key_hash=source;
  ELSIF action='claim' THEN
    UPDATE public.member_handoffs SET claimed_by=a WHERE key_hash=h AND verified_at IS NOT NULL AND expires_at>clock_timestamp() AND (claimed_by IS NULL OR claimed_by=a);
    IF NOT FOUND THEN RETURN false; END IF;
  ELSIF action='expire' THEN UPDATE public.member_handoffs SET expires_at=to_timestamp(0) WHERE key_hash=h;
  ELSE RETURN false;
  END IF;
  RETURN true;
END $$;
CREATE FUNCTION public.member_issue_ticket(h text,n text,data jsonb,exp_ms bigint,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT member_private.authorize(p,'issue_ticket',jsonb_build_object('hash',h,'issuer_nonce',n,'data',data,'expires',exp_ms)) THEN RETURN false; END IF;
  DELETE FROM public.member_arrival_tickets WHERE expires_at<=clock_timestamp();
  INSERT INTO public.member_arrival_tickets(ticket_hash,issuer_nonce,payload,expires_at) VALUES(h,n,data,to_timestamp(exp_ms/1000.0));
  RETURN true;
END $$;
CREATE FUNCTION public.member_consume_ticket(h text,p jsonb) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT member_private.authorize(p,'consume_ticket',jsonb_build_object('hash',h)) THEN RETURN; END IF;
  RETURN QUERY UPDATE public.member_arrival_tickets SET consumed_at=clock_timestamp() WHERE ticket_hash=h AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING payload;
END $$;
REVOKE ALL ON FUNCTION public.member_create_pending_account(uuid,uuid,text,text,jsonb),public.member_activate_account(uuid,uuid,text,jsonb),public.member_lookup_challenge(text,text,jsonb),public.member_write_handoff(text,text,jsonb,text,uuid,bigint,jsonb),public.member_issue_ticket(text,text,jsonb,bigint,jsonb),public.member_consume_ticket(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_create_pending_account(uuid,uuid,text,text,jsonb),public.member_activate_account(uuid,uuid,text,jsonb),public.member_lookup_challenge(text,text,jsonb),public.member_write_handoff(text,text,jsonb,text,uuid,bigint,jsonb),public.member_issue_ticket(text,text,jsonb,bigint,jsonb),public.member_consume_ticket(text,jsonb) TO member_app;
COMMIT;

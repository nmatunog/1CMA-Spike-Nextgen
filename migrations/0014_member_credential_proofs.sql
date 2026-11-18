-- Draft only: no hosted apply or credential/key provisioning.
BEGIN;
REVOKE INSERT,UPDATE ON public.member_credentials,public.member_challenges FROM member_app;
REVOKE INSERT,UPDATE,DELETE ON public.member_pending_signups FROM member_app;

CREATE FUNCTION public.member_create_credential(a uuid,e text,s text,h text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE inserted uuid;
BEGIN
 IF NOT member_private.authorize(p,'create_credential',jsonb_build_object('account',a::text,'email',e,'salt',s,'hash',h)) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_accounts u JOIN public.candidates c ON c.id=u.candidate_id
   JOIN public.member_handoffs x ON x.claimed_by=u.id
   WHERE u.id=a AND u.status='pending' AND c.email_verified AND c.email_normalized=e
     AND x.verified_at IS NOT NULL AND x.expires_at>clock_timestamp() AND x.payload->>'me'=e) THEN RETURN false; END IF;
 INSERT INTO public.member_credentials(account_id,email,password_salt,password_hash,email_verified_at)
   VALUES(a,e,s,h,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING account_id INTO inserted;
 RETURN inserted IS NOT NULL;
END $$;

CREATE FUNCTION public.member_set_password(a uuid,s text,h text,v integer,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE updated uuid;
BEGIN
 IF NOT member_private.authorize(p,'set_password',jsonb_build_object('account',a::text,'salt',s,'hash',h,'version',v)) THEN RETURN false; END IF;
 UPDATE public.member_credentials SET password_salt=s,password_hash=h,auth_version=auth_version+1
 WHERE account_id=a AND auth_version=v AND EXISTS(SELECT 1 FROM public.user_accounts WHERE id=a AND status='active') RETURNING account_id INTO updated;
 RETURN updated IS NOT NULL;
END $$;

CREATE FUNCTION public.member_bump_auth_version(a uuid,v integer,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE updated uuid;
BEGIN
 IF NOT member_private.authorize(p,'bump_auth_version',jsonb_build_object('account',a::text,'version',v)) THEN RETURN false; END IF;
 UPDATE public.member_credentials SET auth_version=auth_version+1 WHERE account_id=a AND auth_version=v RETURNING account_id INTO updated;
 RETURN updated IS NOT NULL;
END $$;

CREATE FUNCTION public.member_stage_pending(k text,e text,s text,h text,x bigint,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'stage_pending',jsonb_build_object('handoff',k,'email',e,'salt',s,'hash',h,'expires',x)) THEN RETURN false; END IF;
 IF x IS NULL OR x<=extract(epoch FROM clock_timestamp())*1000 OR NOT EXISTS(SELECT 1 FROM public.member_handoffs WHERE key_hash=k AND payload->>'me'=e AND claimed_by IS NULL AND expires_at>clock_timestamp()) THEN RETURN false; END IF;
 INSERT INTO public.member_pending_signups(handoff_key,email,password_salt,password_hash,expires_at) VALUES(k,e,s,h,to_timestamp(x/1000.0))
 ON CONFLICT(handoff_key) DO UPDATE SET email=excluded.email,password_salt=excluded.password_salt,password_hash=excluded.password_hash,expires_at=excluded.expires_at;
 RETURN true;
END $$;

CREATE FUNCTION public.member_delete_pending(k text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'delete_pending',jsonb_build_object('handoff',k)) THEN RETURN false; END IF;
 DELETE FROM public.member_pending_signups WHERE handoff_key=k;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.member_rekey_pending(old_key text,new_key text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'rekey_pending',jsonb_build_object('old',old_key,'new',new_key)) THEN RETURN false; END IF;
 -- Rotation expires the source handoff before this call. Both immutable payloads
 -- must still agree, and the destination must be verified and unclaimed.
 IF NOT EXISTS(SELECT 1 FROM public.member_handoffs old JOIN public.member_handoffs fresh ON fresh.key_hash=new_key
   WHERE old.key_hash=old_key AND fresh.payload=old.payload AND fresh.verified_at IS NOT NULL
   AND fresh.expires_at>clock_timestamp() AND fresh.claimed_by IS NULL) THEN RETURN false; END IF;
 UPDATE public.member_pending_signups SET handoff_key=new_key WHERE handoff_key=old_key;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.member_create_challenge(t text,k text,a uuid,e text,h text,x bigint,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'create_challenge',jsonb_build_object('token',t,'kind',k,'account',a::text,'email',e,'handoff',h,'expires',x)) THEN RETURN false; END IF;
 IF k IS NULL OR k NOT IN ('verify','reset') OR t IS NULL OR t !~ '^[a-f0-9]{64}$' OR x IS NULL OR x<=extract(epoch FROM clock_timestamp())*1000 THEN RETURN false; END IF;
 IF k='verify' OR a IS NULL THEN
   IF a IS NOT NULL OR e IS NULL OR NOT EXISTS(SELECT 1 FROM public.member_handoffs WHERE key_hash=h AND payload->>'me'=e AND claimed_by IS NULL AND expires_at>clock_timestamp()) THEN RETURN false; END IF;
 ELSE
   IF e IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.member_credentials c JOIN public.user_accounts u ON u.id=c.account_id WHERE c.account_id=a AND u.status='active') THEN RETURN false; END IF;
 END IF;
 -- Serialize competing issuances, then retire only that identity's prior kind.
 PERFORM pg_advisory_xact_lock(hashtextextended('member-challenge:'||k||':'||coalesce(a::text,h),0));
 UPDATE public.member_challenges SET consumed_at=clock_timestamp() WHERE kind=k AND consumed_at IS NULL AND
   ((k='verify' AND handoff_key=h) OR (k='reset' AND (account_id=a OR (pending_email=e AND handoff_key=h))));
 INSERT INTO public.member_challenges(token_hash,kind,account_id,pending_email,handoff_key,expires_at)
 VALUES(t,k,a,e,h,to_timestamp(x/1000.0));
 RETURN true;
END $$;

CREATE FUNCTION public.member_consume_challenge(t text,k text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'consume_challenge',jsonb_build_object('token',t,'kind',k)) THEN RETURN false; END IF;
 UPDATE public.member_challenges SET consumed_at=clock_timestamp() WHERE token_hash=t AND kind=k AND consumed_at IS NULL AND expires_at>clock_timestamp();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.member_prepare_challenge(t text,k text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'prepare_challenge',jsonb_build_object('token',t,'kind',k)) THEN RETURN false; END IF;
 UPDATE public.member_challenges SET prepared_at=clock_timestamp() WHERE token_hash=t AND kind=k AND consumed_at IS NULL AND expires_at>clock_timestamp();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.member_prune_pending(x bigint,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT member_private.authorize(p,'prune_pending',jsonb_build_object('now',x)) THEN RETURN false; END IF;
 DELETE FROM public.member_pending_signups WHERE expires_at<=to_timestamp(x/1000.0);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.member_prune_pending(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_prune_pending(bigint,jsonb) TO member_app;

REVOKE ALL ON FUNCTION public.member_create_credential(uuid,text,text,text,jsonb),public.member_set_password(uuid,text,text,integer,jsonb),public.member_bump_auth_version(uuid,integer,jsonb),public.member_stage_pending(text,text,text,text,bigint,jsonb),public.member_delete_pending(text,jsonb),public.member_rekey_pending(text,text,jsonb),public.member_create_challenge(text,text,uuid,text,text,bigint,jsonb),public.member_consume_challenge(text,text,jsonb),public.member_prepare_challenge(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_create_credential(uuid,text,text,text,jsonb),public.member_set_password(uuid,text,text,integer,jsonb),public.member_bump_auth_version(uuid,integer,jsonb),public.member_stage_pending(text,text,text,text,bigint,jsonb),public.member_delete_pending(text,jsonb),public.member_rekey_pending(text,text,jsonb),public.member_create_challenge(text,text,uuid,text,text,bigint,jsonb),public.member_consume_challenge(text,text,jsonb),public.member_prepare_challenge(text,text,jsonb) TO member_app;
COMMIT;

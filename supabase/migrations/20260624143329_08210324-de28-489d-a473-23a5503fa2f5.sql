
-- Helper: detect production. Default is production (safe) unless explicitly set otherwise.
CREATE OR REPLACE FUNCTION public._is_non_prod_env()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(current_setting('app.environment', true), '')) IN ('development','dev','demo','staging','test','local');
$$;

-- Rewrite seeder: in prod, skip privileged roles and use random password if creating.
CREATE OR REPLACE FUNCTION public._seed_demo_user(
  _email text,
  _password text,
  _full_name text,
  _roles public.app_role[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_role public.app_role;
  v_is_non_prod boolean := public._is_non_prod_env();
  v_effective_password text := _password;
  v_effective_roles public.app_role[] := _roles;
  v_has_privileged boolean := (
    'developer'::public.app_role = ANY(_roles)
    OR 'moderator'::public.app_role = ANY(_roles)
  );
BEGIN
  -- Production: strip privileged roles and randomize the password.
  IF NOT v_is_non_prod THEN
    v_effective_roles := ARRAY(
      SELECT r FROM unnest(_roles) AS r
      WHERE r NOT IN ('developer'::public.app_role, 'moderator'::public.app_role)
    );
    IF v_has_privileged THEN
      v_effective_password := encode(extensions.gen_random_bytes(32), 'hex');
    END IF;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', _email,
      crypt(v_effective_password, gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', _full_name, 'signup_role', 'owner'),
      now(), now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', _email, 'email_verified', true),
      'email', now(), now(), now()
    );
  ELSE
    -- Only reset the password to the requested one in non-prod, OR when creating fresh.
    -- In prod with existing privileged accounts we DO NOT reset to the repo password — the
    -- cleanup block below handles randomization once.
    IF v_is_non_prod THEN
      UPDATE auth.users
         SET encrypted_password = crypt(v_effective_password, gen_salt('bf')),
             email_confirmed_at = COALESCE(email_confirmed_at, now()),
             updated_at = now()
       WHERE id = v_user_id;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, _full_name)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  FOREACH v_role IN ARRAY v_effective_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_demo_user(text, text, text, public.app_role[]) FROM PUBLIC, anon, authenticated;

-- One-shot cleanup of any already-seeded privileged demo accounts in production.
DO $$
DECLARE
  v_uid uuid;
  v_email text;
  v_emails text[] := ARRAY['admin@rentflow.local', 'moderator@rentflow.local'];
BEGIN
  IF public._is_non_prod_env() THEN
    RETURN;
  END IF;
  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email);
    IF v_uid IS NULL THEN CONTINUE; END IF;

    DELETE FROM public.user_roles
     WHERE user_id = v_uid
       AND role IN ('developer'::public.app_role, 'moderator'::public.app_role);

    UPDATE auth.users
       SET encrypted_password = crypt(encode(extensions.gen_random_bytes(32), 'hex'), gen_salt('bf')),
           updated_at = now()
     WHERE id = v_uid;
  END LOOP;
END
$$;

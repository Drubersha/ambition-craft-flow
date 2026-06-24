-- Seed demo accounts so an unauthenticated visitor can sign in via signInWithPassword.
-- The helper is SECURITY DEFINER and revoked from public roles so no one can call it from the Data API.

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
BEGIN
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
      crypt(_password, gen_salt('bf')), now(),
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
    -- Ensure password matches expected demo password (idempotent re-seed).
    UPDATE auth.users
       SET encrypted_password = crypt(_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, _full_name)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  FOREACH v_role IN ARRAY _roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._seed_demo_user(text, text, text, public.app_role[]) FROM PUBLIC, anon, authenticated;

-- Seed the four demo accounts.
SELECT public._seed_demo_user('demo@rentflow.local',      'demo-rentflow-2024',      'Демо-арендодатель',    ARRAY['owner']::public.app_role[]);
SELECT public._seed_demo_user('demo2@rentflow.local',     'demo2-rentflow-2024',     'Демо-арендодатель 2',  ARRAY['owner']::public.app_role[]);
SELECT public._seed_demo_user('moderator@rentflow.local', 'moderator-rentflow-2024', 'Модератор',            ARRAY['moderator','owner']::public.app_role[]);
SELECT public._seed_demo_user('admin@rentflow.local',     'admin-rentflow-2024',     'Администратор',        ARRAY['developer','owner']::public.app_role[]);

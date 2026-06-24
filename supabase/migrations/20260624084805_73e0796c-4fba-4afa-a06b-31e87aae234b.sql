DO $$
DECLARE demo_id uuid;
BEGIN
  SELECT id INTO demo_id FROM auth.users WHERE lower(email) = 'demo@rentflow.local' LIMIT 1;
  IF demo_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES
      (demo_id, 'owner'::public.app_role),
      (demo_id, 'moderator'::public.app_role),
      (demo_id, 'developer'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
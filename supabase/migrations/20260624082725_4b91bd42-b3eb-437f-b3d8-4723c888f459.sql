
CREATE TABLE public.user_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, member_user_id, role),
  CHECK (role IN ('manager'::public.app_role, 'tenant'::public.app_role))
);
CREATE INDEX user_links_owner_idx ON public.user_links(owner_user_id);
CREATE INDEX user_links_member_idx ON public.user_links(member_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_links TO authenticated;
GRANT ALL ON public.user_links TO service_role;

ALTER TABLE public.user_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_links select" ON public.user_links FOR SELECT TO authenticated
USING (auth.uid() = owner_user_id OR auth.uid() = member_user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_links insert" ON public.user_links FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_links delete" ON public.user_links FOR DELETE TO authenticated
USING (auth.uid() = owner_user_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_linked_member(_owner uuid, _member uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_links
    WHERE owner_user_id = _owner AND member_user_id = _member AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_owner_ids(_role public.app_role)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_user_id FROM public.user_links
  WHERE member_user_id = auth.uid() AND role = _role
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_app_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  v_role := COALESCE(NEW.raw_user_meta_data->>'signup_role', 'owner');
  IF v_role NOT IN ('owner','tenant') THEN v_role := 'owner'; END IF;
  v_app_role := v_role::public.app_role;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE POLICY "properties linked manager" ON public.properties FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "properties linked tenant" ON public.properties FOR SELECT TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE POLICY "contracts linked manager" ON public.contracts FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "contracts linked tenant" ON public.contracts FOR SELECT TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE POLICY "charges linked manager" ON public.charges FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "charges linked tenant" ON public.charges FOR SELECT TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE POLICY "payments linked manager" ON public.payments FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "payments linked tenant" ON public.payments FOR SELECT TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE POLICY "tenants linked manager" ON public.tenants FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));

CREATE POLICY "documents linked manager" ON public.documents FOR ALL TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "documents linked tenant" ON public.documents FOR SELECT TO authenticated
USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE POLICY "profiles linked or admin select" ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.user_links ul
  WHERE (ul.owner_user_id = profiles.id AND ul.member_user_id = auth.uid())
     OR (ul.member_user_id = profiles.id AND ul.owner_user_id = auth.uid())
));

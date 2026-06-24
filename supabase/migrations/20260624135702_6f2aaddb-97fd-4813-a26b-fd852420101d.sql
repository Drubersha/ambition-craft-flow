CREATE OR REPLACE FUNCTION public.tenant_can_access_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    JOIN public.user_links ul
      ON ul.owner_user_id = d.owner_id
     AND ul.member_user_id = auth.uid()
     AND ul.role = 'tenant'::public.app_role
    JOIN auth.users u ON u.id = auth.uid()
    WHERE d.id = _doc_id
      AND u.email IS NOT NULL
      AND (
        (d.owner_kind = 'tenant'::public.document_owner_kind AND EXISTS (
          SELECT 1 FROM public.tenants t
          WHERE t.id = d.ref_id
            AND t.owner_id = d.owner_id
            AND t.email IS NOT NULL
            AND lower(t.email) = lower(u.email)
        ))
        OR
        (d.owner_kind = 'contract'::public.document_owner_kind AND EXISTS (
          SELECT 1
          FROM public.contracts c
          JOIN public.tenants t ON t.id = c.tenant_id
          WHERE c.id = d.ref_id
            AND c.owner_id = d.owner_id
            AND t.email IS NOT NULL
            AND lower(t.email) = lower(u.email)
        ))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.tenant_can_access_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_can_access_document(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "documents linked tenant" ON public.documents;
CREATE POLICY "documents linked tenant"
  ON public.documents FOR SELECT TO authenticated
  USING (public.tenant_can_access_document(id));

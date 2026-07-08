-- Multiple contact persons per counterparty (tenant): at least one is expected
-- (enforced by the form), up to 5 total (enforced here). A contact needs a
-- name plus an email and/or a phone.
--
-- Existing data is PRESERVED: tenants.contact_person/email/phone stay in place
-- (they keep powering the tenant-cabinet email match and list search), and the
-- current values are copied into the first contact row below.

CREATE TABLE public.tenant_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  email text,
  phone text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(phone), '')) IS NOT NULL)
);
CREATE INDEX idx_tenant_contacts_tenant ON public.tenant_contacts(tenant_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_contacts TO authenticated;
GRANT ALL ON public.tenant_contacts TO service_role;

ALTER TABLE public.tenant_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tenant_contacts" ON public.tenant_contacts
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tenant_contacts linked manager" ON public.tenant_contacts
  FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));

CREATE TRIGGER trg_tenant_contacts_updated BEFORE UPDATE ON public.tenant_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Hard cap: 5 contact persons per tenant.
CREATE OR REPLACE FUNCTION public.tenant_contacts_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.tenant_contacts WHERE tenant_id = NEW.tenant_id) >= 5 THEN
    RAISE EXCEPTION 'У контрагента не может быть больше 5 контактных лиц';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tenant_contacts_enforce_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tenant_contacts_limit BEFORE INSERT ON public.tenant_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tenant_contacts_enforce_limit();

-- Preserve already-entered data: one contact per tenant from the legacy
-- fields. Tenants without email AND phone are skipped (a contact row requires
-- one of them); their name/notes stay untouched on the tenant itself.
INSERT INTO public.tenant_contacts (owner_id, tenant_id, full_name, email, phone, sort_order)
SELECT
  t.owner_id,
  t.id,
  COALESCE(NULLIF(btrim(t.contact_person), ''), t.name),
  NULLIF(btrim(t.email), ''),
  NULLIF(btrim(t.phone), ''),
  0
FROM public.tenants t
WHERE COALESCE(NULLIF(btrim(t.email), ''), NULLIF(btrim(t.phone), '')) IS NOT NULL;

NOTIFY pgrst, 'reload schema';

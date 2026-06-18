
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('owner', 'manager');
CREATE TYPE public.property_type AS ENUM ('office', 'warehouse', 'retail', 'production', 'coworking', 'other');
CREATE TYPE public.property_status AS ENUM ('free', 'occupied', 'partial', 'maintenance', 'archived');
CREATE TYPE public.tenant_kind AS ENUM ('person', 'company');
CREATE TYPE public.contract_status AS ENUM ('draft', 'active', 'finished', 'terminated');
CREATE TYPE public.payment_period AS ENUM ('monthly', 'quarterly', 'yearly', 'one_time');
CREATE TYPE public.charge_status AS ENUM ('unpaid', 'partial', 'paid', 'overdue');
CREATE TYPE public.document_owner_kind AS ENUM ('property', 'tenant', 'contract');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles select" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ===== Auto-create profile + owner role on signup =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== updated_at helper =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===== PROPERTIES =====
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  type property_type NOT NULL DEFAULT 'other',
  cadastral_no TEXT,
  area_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  area_usable NUMERIC(12,2),
  floor TEXT,
  room_no TEXT,
  status property_status NOT NULL DEFAULT 'free',
  base_rate NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'RUB',
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own properties" ON public.properties FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_properties_owner ON public.properties(owner_id);

-- ===== TENANTS =====
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind tenant_kind NOT NULL DEFAULT 'company',
  inn TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tenants" ON public.tenants FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_tenants_owner ON public.tenants(owner_id);

-- ===== CONTRACTS =====
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  cadastral_no TEXT,
  area NUMERIC(12,2),
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  payment_period payment_period NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE,
  status contract_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contracts" ON public.contracts FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_contracts_owner ON public.contracts(owner_id);
CREATE INDEX idx_contracts_tenant ON public.contracts(tenant_id);
CREATE INDEX idx_contracts_property ON public.contracts(property_id);

-- ===== CHARGES =====
CREATE TABLE public.charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  status charge_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own charges" ON public.charges FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_charges_updated BEFORE UPDATE ON public.charges FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_charges_owner ON public.charges(owner_id);
CREATE INDEX idx_charges_contract ON public.charges(contract_id);

-- ===== CHARGE ITEMS =====
CREATE TABLE public.charge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'rent',
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_items TO authenticated;
GRANT ALL ON public.charge_items TO service_role;
ALTER TABLE public.charge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own charge items" ON public.charge_items FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_charge_items_charge ON public.charge_items(charge_id);

-- ===== PAYMENTS =====
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_payments_charge ON public.payments(charge_id);
CREATE INDEX idx_payments_owner ON public.payments(owner_id);

-- ===== Auto-update charges paid_total and status when payments change =====
CREATE OR REPLACE FUNCTION public.recalc_charge(_charge_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paid NUMERIC(14,2);
  v_total NUMERIC(14,2);
  v_due DATE;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments WHERE charge_id = _charge_id;
  SELECT total, due_date INTO v_total, v_due FROM public.charges WHERE id = _charge_id;
  UPDATE public.charges SET
    paid_total = v_paid,
    status = CASE
      WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'::charge_status
      WHEN v_paid > 0 AND v_paid < v_total THEN 'partial'::charge_status
      WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE AND v_paid < v_total THEN 'overdue'::charge_status
      ELSE 'unpaid'::charge_status
    END
  WHERE id = _charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_payments_recalc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recalc_charge(COALESCE(NEW.charge_id, OLD.charge_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_payments_recalc_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payments_recalc();

-- ===== DOCUMENTS =====
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_kind document_owner_kind NOT NULL,
  ref_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  label TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents" ON public.documents FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_documents_ref ON public.documents(owner_kind, ref_id);
CREATE INDEX idx_documents_owner ON public.documents(owner_id);

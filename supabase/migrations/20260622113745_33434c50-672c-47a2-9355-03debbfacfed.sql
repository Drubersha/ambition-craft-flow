
-- Lead funnel kanban tables
CREATE TYPE public.lead_source AS ENUM ('avito','cian','yandex','referral','website','other');
CREATE TYPE public.lead_stage AS ENUM ('inquiry','viewing','documents','contract_sent','signed');
CREATE TYPE public.lead_status AS ENUM ('active','archived','won');

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  inn text,
  source public.lead_source NOT NULL DEFAULT 'other',
  budget numeric(14,2),
  desired_area numeric(14,2),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  stage public.lead_stage NOT NULL DEFAULT 'inquiry',
  status public.lead_status NOT NULL DEFAULT 'active',
  archived_reason text,
  archived_at timestamptz,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own leads" ON public.leads
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_leads_owner_status ON public.leads(owner_id, status);
CREATE INDEX idx_leads_stage ON public.leads(stage);

-- Stage transition history
CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_stage public.lead_stage,
  to_stage public.lead_stage,
  passed boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own lead events" ON public.lead_events
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_lead_events_lead ON public.lead_events(lead_id, created_at DESC);

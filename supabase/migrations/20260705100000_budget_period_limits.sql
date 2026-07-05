-- Per-period overrides of category limits, so past periods can keep the
-- planned values that were in effect back then (better analytics). When no
-- override exists for a period, the category's standard limit applies.
CREATE TABLE public.budget_period_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  limit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, period_start)
);
CREATE INDEX idx_budget_period_limits_plan_period
  ON public.budget_period_limits(plan_id, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_period_limits TO authenticated;
GRANT ALL ON public.budget_period_limits TO service_role;

ALTER TABLE public.budget_period_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budget_period_limits" ON public.budget_period_limits
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_budget_period_limits_updated
  BEFORE UPDATE ON public.budget_period_limits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE public.budget_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE UNIQUE,
  reset_day smallint NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 28),
  warning_percent numeric(5,2) NOT NULL DEFAULT 80,
  currency text NOT NULL DEFAULT 'RUB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_plans TO authenticated;
GRANT ALL ON public.budget_plans TO service_role;
ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budget_plans" ON public.budget_plans FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_budget_plans_updated BEFORE UPDATE ON public.budget_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  limit_amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_budget_categories_plan ON public.budget_categories(plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
GRANT ALL ON public.budget_categories TO service_role;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budget_categories" ON public.budget_categories FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_budget_categories_updated BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.budget_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  spent_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_budget_expenses_plan ON public.budget_expenses(plan_id);
CREATE INDEX idx_budget_expenses_cat ON public.budget_expenses(category_id);
CREATE INDEX idx_budget_expenses_owner_date ON public.budget_expenses(owner_id, spent_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_expenses TO authenticated;
GRANT ALL ON public.budget_expenses TO service_role;
ALTER TABLE public.budget_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budget_expenses" ON public.budget_expenses FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

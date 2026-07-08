-- Server-side sanity limits for money/measure fields across the domain.
-- Browser forms validate too, but the database stays the authority: a crafted
-- API request must not be able to store negative sums, rates or areas.
--
-- Idempotent and safe on an already-initialised database: obviously-invalid
-- existing values are clamped first so adding the constraints cannot fail.

-- Charges & payments
UPDATE public.charges SET total = 0 WHERE total < 0;
UPDATE public.payments SET amount = 0 WHERE amount < 0;

-- Contracts
UPDATE public.contracts SET rate = 0 WHERE rate < 0;
UPDATE public.contracts SET area = 0 WHERE area IS NOT NULL AND area < 0;
-- deposit_percent is numeric(5,2): values above 999.99 are physically
-- impossible, so only the negative side needs clamping.
UPDATE public.contracts SET deposit_percent = 0 WHERE deposit_percent IS NOT NULL AND deposit_percent < 0;

-- Budget
UPDATE public.budget_categories SET limit_amount = 0 WHERE limit_amount < 0;
UPDATE public.budget_expenses SET amount = 0 WHERE amount < 0;

-- Leads
UPDATE public.leads SET budget = 0 WHERE budget IS NOT NULL AND budget < 0;
UPDATE public.leads SET desired_area = 0 WHERE desired_area IS NOT NULL AND desired_area < 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'charges_total_nonnegative') THEN
    ALTER TABLE public.charges
      ADD CONSTRAINT charges_total_nonnegative CHECK (total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonnegative') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_rate_nonnegative') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_rate_nonnegative CHECK (rate >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_area_nonnegative') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_area_nonnegative CHECK (area IS NULL OR area >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_deposit_percent_range') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_deposit_percent_range
        CHECK (deposit_percent IS NULL OR (deposit_percent >= 0 AND deposit_percent <= 1000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_categories_limit_nonnegative') THEN
    ALTER TABLE public.budget_categories
      ADD CONSTRAINT budget_categories_limit_nonnegative CHECK (limit_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_expenses_amount_nonnegative') THEN
    ALTER TABLE public.budget_expenses
      ADD CONSTRAINT budget_expenses_amount_nonnegative CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_budget_nonnegative') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_budget_nonnegative CHECK (budget IS NULL OR budget >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_desired_area_nonnegative') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_desired_area_nonnegative CHECK (desired_area IS NULL OR desired_area >= 0);
  END IF;
END $$;

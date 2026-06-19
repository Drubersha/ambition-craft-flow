
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS termination_terms TEXT,
  ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(14,2);

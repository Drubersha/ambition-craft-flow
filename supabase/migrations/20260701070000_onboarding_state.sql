-- Cross-device onboarding state: store the quest progress on the user's profile
-- (jsonb: { dismissed, completedAt, visited, replay, welcomed }).
-- Idempotent so it is safe to run on an already-initialised database.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

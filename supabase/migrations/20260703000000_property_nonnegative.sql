-- Enforce non-negative property numbers on the SERVER. The property form only
-- validates in the browser, so a crafted API request could still store negative
-- areas/rates. CHECK constraints make the database the authority.
--
-- Idempotent and safe on an already-initialised database: any existing negative
-- values (invalid by definition) are clamped to 0 first so adding the
-- constraints cannot fail.

UPDATE public.properties SET area_total = 0 WHERE area_total < 0;
UPDATE public.properties SET area_usable = 0 WHERE area_usable < 0;
UPDATE public.properties SET base_rate = 0 WHERE base_rate < 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_area_total_nonnegative') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_area_total_nonnegative CHECK (area_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_area_usable_nonnegative') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_area_usable_nonnegative CHECK (area_usable IS NULL OR area_usable >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_base_rate_nonnegative') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_base_rate_nonnegative CHECK (base_rate IS NULL OR base_rate >= 0);
  END IF;
END $$;

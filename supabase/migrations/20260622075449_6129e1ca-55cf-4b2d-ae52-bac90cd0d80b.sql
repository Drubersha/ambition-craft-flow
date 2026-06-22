
CREATE OR REPLACE FUNCTION public.recalc_property_status(_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_total NUMERIC(14,2);
  v_rent NUMERIC(14,2);
  v_ahch NUMERIC(14,2);
  v_current_status property_status;
BEGIN
  SELECT area_total, status INTO v_total, v_current_status
  FROM public.properties WHERE id = _property_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_current_status IN ('maintenance','archived') THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(area) FILTER (WHERE kind = 'rent'), 0),
    COALESCE(SUM(area) FILTER (WHERE kind = 'ahch'), 0)
  INTO v_rent, v_ahch
  FROM public.contracts
  WHERE property_id = _property_id
    AND status = 'active'
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    AND (start_date IS NULL OR start_date <= CURRENT_DATE);

  UPDATE public.properties SET status =
    CASE
      WHEN v_rent > 0 AND (v_total IS NULL OR v_total <= 0 OR v_rent >= v_total) THEN 'occupied'::property_status
      WHEN v_rent > 0 THEN 'partial'::property_status
      WHEN v_ahch > 0 AND (v_total IS NULL OR v_total <= 0 OR v_ahch >= v_total) THEN 'ahch'::property_status
      WHEN v_ahch > 0 THEN 'partial_ahch'::property_status
      ELSE 'free'::property_status
    END
  WHERE id = _property_id;
END;
$function$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.properties LOOP
    PERFORM public.recalc_property_status(r.id);
  END LOOP;
END $$;

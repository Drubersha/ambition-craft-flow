
CREATE OR REPLACE FUNCTION public.recalc_property_status(_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(14,2);
  v_occupied NUMERIC(14,2);
  v_current_status property_status;
BEGIN
  SELECT area_total, status INTO v_total, v_current_status
  FROM public.properties WHERE id = _property_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_current_status IN ('maintenance','archived','ahch','partial_ahch') THEN RETURN; END IF;

  SELECT COALESCE(SUM(area), 0) INTO v_occupied
  FROM public.contracts
  WHERE property_id = _property_id
    AND status = 'active'
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    AND (start_date IS NULL OR start_date <= CURRENT_DATE);

  UPDATE public.properties SET status =
    CASE
      WHEN v_occupied <= 0 THEN 'free'::property_status
      WHEN v_total IS NULL OR v_total <= 0 OR v_occupied >= v_total THEN 'occupied'::property_status
      ELSE 'partial'::property_status
    END
  WHERE id = _property_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_property_status(uuid) FROM PUBLIC, anon, authenticated;

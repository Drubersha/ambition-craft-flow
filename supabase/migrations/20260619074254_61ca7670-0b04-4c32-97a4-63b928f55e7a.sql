GRANT EXECUTE ON FUNCTION public.recalc_charge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_payments_recalc() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_payments_recalc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_payments_recalc() TO service_role;
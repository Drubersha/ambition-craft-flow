CREATE OR REPLACE FUNCTION public.trg_payments_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recalc_charge(COALESCE(NEW.charge_id, OLD.charge_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recalc_charge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_charge(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_payments_recalc() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_payments_recalc_aiud'
      AND tgrelid = 'public.payments'::regclass
  ) THEN
    CREATE TRIGGER trg_payments_recalc_aiud
      AFTER INSERT OR UPDATE OR DELETE ON public.payments
      FOR EACH ROW EXECUTE FUNCTION public.trg_payments_recalc();
  END IF;
END $$;
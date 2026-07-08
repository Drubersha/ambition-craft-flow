-- Contract notifications showed the internal row id ("Договор #0dcb03fb-…")
-- instead of the user-entered contract number. Use contracts.number.

CREATE OR REPLACE FUNCTION public.trg_notify_contract_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, 'contract', 'Новый договор',
    'Договор № ' || COALESCE(NULLIF(btrim(NEW.number), ''), 'без номера'),
    'contracts', NEW.id, '/contracts/' || NEW.id::text
  );
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_notify_contract_insert() FROM PUBLIC, anon, authenticated;

-- Repair notifications that were already created with the internal id: they
-- reference the contract via entity_id, so the real number can be backfilled.
UPDATE public.notifications n
SET body = 'Договор № ' || COALESCE(NULLIF(btrim(c.number), ''), 'без номера')
FROM public.contracts c
WHERE n.entity_table = 'contracts'
  AND n.entity_id = c.id
  AND n.kind = 'contract'
  AND n.body = 'Договор #' || c.id::text;


-- Revoke broad EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public._notify_owner_and_managers(uuid, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_charge(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_property_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_chat_messages_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_contracts_recalc_property() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_charge_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_chat_message_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_contract_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_property_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_notify_tenant_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_payments_recalc() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: callable by signed-in users only (used inside RLS policies)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_linked_member(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_owner_ids(public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_member(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_owner_ids(public.app_role) TO authenticated;

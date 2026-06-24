-- 1. Table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  entity_table text,
  entity_id uuid,
  route text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_delete" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. Helper: insert for owner + linked managers
CREATE OR REPLACE FUNCTION public._notify_owner_and_managers(
  _owner_id uuid, _kind text, _title text, _body text,
  _entity_table text, _entity_id uuid, _route text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, kind, title, body, entity_table, entity_id, route)
  VALUES (_owner_id, _kind, _title, _body, _entity_table, _entity_id, _route);
  INSERT INTO public.notifications(user_id, kind, title, body, entity_table, entity_id, route)
  SELECT ul.member_user_id, _kind, _title, _body, _entity_table, _entity_id, _route
  FROM public.user_links ul
  WHERE ul.owner_user_id = _owner_id AND ul.role = 'manager'::app_role;
END $$;

-- 3. Properties
CREATE OR REPLACE FUNCTION public.trg_notify_property_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, 'property', 'Новый объект', COALESCE(NEW.name, ''),
    'properties', NEW.id, '/properties/' || NEW.id::text
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_property_insert AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_property_insert();

-- 4. Tenants
CREATE OR REPLACE FUNCTION public.trg_notify_tenant_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, 'tenant', 'Новый арендатор', COALESCE(NEW.name, ''),
    'tenants', NEW.id, '/tenants/' || NEW.id::text
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_tenant_insert AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_tenant_insert();

-- 5. Contracts
CREATE OR REPLACE FUNCTION public.trg_notify_contract_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, 'contract', 'Новый договор',
    'Договор #' || COALESCE(NEW.id::text, ''),
    'contracts', NEW.id, '/contracts/' || NEW.id::text
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_contract_insert AFTER INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_contract_insert();

-- 6. Charges (with indexation detection by notes)
CREATE OR REPLACE FUNCTION public.trg_notify_charge_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text;
  v_title text;
BEGIN
  IF NEW.notes ILIKE '%индекс%' THEN
    v_kind := 'indexation'; v_title := 'Индексация';
  ELSE
    v_kind := 'charge'; v_title := 'Новое начисление';
  END IF;
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, v_kind, v_title,
    'Сумма: ' || NEW.total::text,
    'charges', NEW.id, '/charges/' || NEW.id::text
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_charge_insert AFTER INSERT ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_charge_insert();

-- 7. Chat messages (notify owner side when tenant writes)
CREATE OR REPLACE FUNCTION public.trg_notify_chat_message_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.sender_role = 'tenant'::chat_sender_role THEN
    SELECT owner_id INTO v_owner FROM public.chat_threads WHERE id = NEW.thread_id;
    IF v_owner IS NOT NULL THEN
      PERFORM public._notify_owner_and_managers(
        v_owner, 'chat', 'Новое сообщение в чате',
        LEFT(COALESCE(NEW.body, ''), 200),
        'chat_threads', NEW.thread_id, '/chats'
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notify_chat_message_insert AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_chat_message_insert();

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

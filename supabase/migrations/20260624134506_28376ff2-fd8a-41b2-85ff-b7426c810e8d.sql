
-- Helper: which role does the current user play in a given chat thread?
CREATE OR REPLACE FUNCTION public.my_chat_role(_thread uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT CASE
    WHEN t.owner_id = auth.uid() THEN 'owner'
    WHEN EXISTS (
      SELECT 1 FROM public.user_links ul
      WHERE ul.owner_user_id = t.owner_id
        AND ul.member_user_id = auth.uid()
        AND ul.role = 'manager'
    ) THEN 'manager'
    WHEN EXISTS (
      SELECT 1 FROM public.user_links ul
      JOIN public.tenants te ON te.id = t.tenant_id
      JOIN auth.users u      ON u.id  = auth.uid()
      WHERE ul.owner_user_id = t.owner_id
        AND ul.member_user_id = auth.uid()
        AND ul.role = 'tenant'
        AND te.email IS NOT NULL
        AND u.email IS NOT NULL
        AND lower(te.email) = lower(u.email)
    ) THEN 'tenant'
  END
  FROM public.chat_threads t WHERE t.id = _thread
$$;

REVOKE EXECUTE ON FUNCTION public.my_chat_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_chat_role(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.my_chat_role(uuid) TO authenticated;

-- chat_threads
DROP POLICY IF EXISTS "owner manages own threads" ON public.chat_threads;
DROP POLICY IF EXISTS "thread owner full" ON public.chat_threads;
DROP POLICY IF EXISTS "thread manager full" ON public.chat_threads;
DROP POLICY IF EXISTS "thread tenant select" ON public.chat_threads;
DROP POLICY IF EXISTS "thread tenant update" ON public.chat_threads;

CREATE POLICY "thread owner full" ON public.chat_threads
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "thread manager full" ON public.chat_threads
  FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'));

CREATE POLICY "thread tenant select" ON public.chat_threads
  FOR SELECT TO authenticated
  USING (public.my_chat_role(id) = 'tenant');

CREATE POLICY "thread tenant update" ON public.chat_threads
  FOR UPDATE TO authenticated
  USING (public.my_chat_role(id) = 'tenant')
  WITH CHECK (public.my_chat_role(id) = 'tenant');

-- chat_messages
DROP POLICY IF EXISTS "owner manages own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "msg owner full" ON public.chat_messages;
DROP POLICY IF EXISTS "msg manager full" ON public.chat_messages;
DROP POLICY IF EXISTS "msg tenant select" ON public.chat_messages;
DROP POLICY IF EXISTS "msg tenant insert" ON public.chat_messages;

CREATE POLICY "msg owner full" ON public.chat_messages
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "msg manager full" ON public.chat_messages
  FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'));

CREATE POLICY "msg tenant select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.my_chat_role(thread_id) = 'tenant');

CREATE POLICY "msg tenant insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_chat_role(thread_id) = 'tenant'
    AND sender_role = 'tenant'
    AND owner_id = (SELECT owner_id FROM public.chat_threads WHERE id = thread_id)
  );

-- chat_attachments
DROP POLICY IF EXISTS "owner manages own attachments" ON public.chat_attachments;
DROP POLICY IF EXISTS "att owner full" ON public.chat_attachments;
DROP POLICY IF EXISTS "att manager full" ON public.chat_attachments;
DROP POLICY IF EXISTS "att tenant select" ON public.chat_attachments;
DROP POLICY IF EXISTS "att tenant insert" ON public.chat_attachments;

CREATE POLICY "att owner full" ON public.chat_attachments
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "att manager full" ON public.chat_attachments
  FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'));

CREATE POLICY "att tenant select" ON public.chat_attachments
  FOR SELECT TO authenticated
  USING (
    public.my_chat_role(
      (SELECT thread_id FROM public.chat_messages WHERE id = message_id)
    ) = 'tenant'
  );

CREATE POLICY "att tenant insert" ON public.chat_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_chat_role(
      (SELECT thread_id FROM public.chat_messages WHERE id = message_id)
    ) = 'tenant'
    AND owner_id = (
      SELECT owner_id FROM public.chat_messages WHERE id = message_id
    )
  );

-- Storage policies for chat-attachments bucket
DROP POLICY IF EXISTS "chat attachments owner read" ON storage.objects;
DROP POLICY IF EXISTS "chat attachments owner write" ON storage.objects;
DROP POLICY IF EXISTS "chat attachments owner delete" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments read" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments write" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments delete" ON storage.objects;

CREATE POLICY "chat-attachments read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.my_chat_role(NULLIF((storage.foldername(name))[2], '')::uuid) IS NOT NULL
  );

CREATE POLICY "chat-attachments write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.my_chat_role(NULLIF((storage.foldername(name))[2], '')::uuid) IS NOT NULL
  );

CREATE POLICY "chat-attachments delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.my_chat_role(NULLIF((storage.foldername(name))[2], '')::uuid) IN ('owner','manager')
  );

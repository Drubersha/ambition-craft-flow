## Проблема

Все RLS чата (`chat_threads`, `chat_messages`, `chat_attachments`) и storage-политики `chat-attachments` завязаны на `owner_id = auth.uid()`. Реальный tenant-пользователь не равен owner треда, поэтому не может ни читать, ни писать. Клиент тоже жёстко проставляет `owner_id = current user id`, что ломает архитектуру для tenant/manager.

## Решение

### 1. Миграция — RLS чата на основе ролей

Добавить SECURITY DEFINER helper:

```sql
CREATE OR REPLACE FUNCTION public.my_chat_role(_thread uuid)
RETURNS text  -- 'owner' | 'manager' | 'tenant' | NULL
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT CASE
    WHEN t.owner_id = auth.uid() THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM public.user_links ul
                 WHERE ul.owner_user_id = t.owner_id
                   AND ul.member_user_id = auth.uid()
                   AND ul.role = 'manager') THEN 'manager'
    WHEN EXISTS (
      SELECT 1 FROM public.user_links ul
      JOIN public.tenants te ON te.id = t.tenant_id
      JOIN auth.users u      ON u.id  = auth.uid()
      WHERE ul.owner_user_id = t.owner_id
        AND ul.member_user_id = auth.uid()
        AND ul.role = 'tenant'
        AND lower(te.email) = lower(u.email)
    ) THEN 'tenant'
  END
  FROM public.chat_threads t WHERE t.id = _thread
$$;
REVOKE EXECUTE ON FUNCTION public.my_chat_role(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_chat_role(uuid) TO authenticated;
```

Заменить политики (старые `owner manages ...` дропаются, существующие данные не трогаются):

`chat_threads`:
- owner ALL: `owner_id = auth.uid()`
- manager ALL: `is_linked_member(owner_id, auth.uid(), 'manager')`
- tenant SELECT: `my_chat_role(id) = 'tenant'`
- tenant UPDATE (только для счётчиков): `my_chat_role(id) = 'tenant'`

`chat_messages`:
- owner ALL: `owner_id = auth.uid()` (без локального ограничения `sender_role` — это сохранит работу demo-импersonации)
- manager ALL: `is_linked_member(owner_id, auth.uid(), 'manager')`
- tenant SELECT: `my_chat_role(thread_id) = 'tenant'`
- tenant INSERT: `my_chat_role(thread_id) = 'tenant' AND sender_role = 'tenant' AND owner_id = (SELECT owner_id FROM chat_threads WHERE id = thread_id)`

`chat_attachments`: те же три уровня, проверка через `chat_messages.thread_id`.

### 2. Storage RLS для `chat-attachments`

Путь сохраняем `<owner_id>/<thread_id>/<message_id>/<filename>`, чтобы folder[1] остался owner_id (старые файлы валидны).

Удалить 3 текущие политики и создать новые:

```sql
-- SELECT / INSERT: доступ имеют все, у кого my_chat_role по thread_id из пути не NULL
CREATE POLICY "chat-attachments read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments'
       AND public.my_chat_role(((storage.foldername(name))[2])::uuid) IS NOT NULL);

CREATE POLICY "chat-attachments write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments'
            AND public.my_chat_role(((storage.foldername(name))[2])::uuid) IS NOT NULL);

CREATE POLICY "chat-attachments delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments'
       AND public.my_chat_role(((storage.foldername(name))[2])::uuid) IN ('owner','manager'));
```

### 3. Серверная `ensureChatThread`

Новая server fn `src/lib/chat.functions.ts → ensureChatThread({ tenantId })`:
1. `requireSupabaseAuth` → есть `userId`, `claims.email`.
2. Берём `tenants.owner_id` (через `supabaseAdmin`, читая только `id, owner_id, email`).
3. Авторизуем caller:
   - owner: `tenant.owner_id === userId`;
   - manager: `is_linked_member(owner, userId, 'manager')`;
   - tenant: `is_linked_member(owner, userId, 'tenant') AND lower(tenant.email) === lower(claims.email)`.
4. Если ни одна не выполнена — `throw new Error("Forbidden")`.
5. Upsert thread `(owner_id=tenant.owner_id, tenant_id)` через `supabaseAdmin` и возвращаем `id, owner_id`.

Клиентская `ensureChatThread()` в `chat-thread.tsx` заменяется тонкой обёрткой над server fn (через `useServerFn`/прямой вызов). Возвращает `{ threadId, ownerId }`.

### 4. Клиент `chat-thread.tsx`

Подгружаем сам thread, чтобы знать `owner_id`:
- `useQuery(['chat-thread', threadId])` → `{ id, owner_id, tenant_id }` (RLS уже разрешит).
- `send()`:
  - `owner_id: thread.owner_id` (не `auth.uid()`);
  - `sender_role: myRole` (без изменений);
  - storage path: `${thread.owner_id}/${threadId}/${msg.id}/${file.name}`;
  - attachment insert: `owner_id: thread.owner_id`.
- Сброс счётчиков и подписка realtime — без изменений (триггер `trg_chat_messages_after_insert` уже корректно ведёт `unread_owner` / `unread_tenant`).

### 5. Tenant route `me.chat.tsx`

- `useTenantContext()` → `tenantId`.
- Вместо клиентского `ensureChatThread(tenantId)` — `useServerFn(ensureChatThread)`.
- На случай `Forbidden` (email рассинхрон) показываем понятное сообщение.

### 6. Owner/manager route `chats.index.tsx`

- Гард `role === 'tenant'` оставляем (demo).
- `openTenant(tenantId)` теперь зовёт server fn `ensureChatThread`. RLS гарантирует, что manager увидит только threads привязанного owner.
- Список `tenants` уже под RLS (`tenants linked manager` policy), список `chat_threads` тоже — отдельный фильтр не нужен.

### 7. Demo совместимость

- Demo owner-as-tenant продолжает работать: caller `=` owner треда, owner-policy ALL → может писать с любым `sender_role`. Триггер счётчиков уже различает по `sender_role`.
- Demo identity switcher и `viewAsTenant` остаются без изменений.

## Acceptance / проверка

После применения миграции прогнать вручную или через Playwright:
- owner логинится → видит все свои чаты, отправляет сообщение → `unread_tenant++`;
- manager (linked) → видит threads привязанного owner, может писать;
- real tenant (email совпадает с `tenants.email`) → `/me/chat` подгружает только свой thread, отправка сообщения и вложения работает, owner получает `unread_owner++`;
- демо-сценарий (owner смотрит как tenant) — без регрессий;
- посторонний user без `user_links` — `SELECT * FROM chat_threads/messages/attachments` возвращает 0 строк, `INSERT` падает.

## Технические детали (для разработчика)

Файлы:
- новая миграция `supabase/migrations/<ts>_chat_rls_multi_role.sql` — функция `my_chat_role`, дроп старых политик, создание новых для 3 таблиц чата и `storage.objects` (chat-attachments);
- новый `src/lib/chat.functions.ts` с `ensureChatThread` (createServerFn + requireSupabaseAuth);
- правки `src/components/chat/chat-thread.tsx` (use thread.owner_id, новый ensureChatThread обёртка);
- правки `src/routes/_authenticated/me.chat.tsx` (через server fn + обработка Forbidden);
- мелкая правка `src/routes/_authenticated/chats.index.tsx` (вызов нового ensureChatThread).

Что не меняем: схему таблиц, триггер счётчиков, layout пути в storage, demo identity provider, существующие данные.

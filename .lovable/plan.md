
# Множественные роли, привязка к арендодателю, выбор аккаунта при входе

## 1. Модель аккаунтов и ролей

В существующем enum `app_role` уже есть `owner`, `manager`, `tenant`, `developer`, `moderator`. Используем их же — отдельный «арендодатель» = `owner`.

Один email = один `auth.users`. Один пользователь может одновременно иметь роли `owner` и `tenant` (и быть `manager` у других). Привязка к конкретному арендодателю хранится в новой таблице связей, а не на профиле.

Новая таблица `public.user_links`:
- `owner_user_id` — арендодатель (роль `owner`)
- `member_user_id` — привязанный пользователь
- `role` — `manager` | `tenant`
- `created_by`, `created_at`
- UNIQUE (`owner_user_id`, `member_user_id`, `role`)

`user_roles` остаётся источником «какие роли есть у юзера в системе». `user_links` отвечает на «к какому арендодателю он привязан и в какой роли».

Хелперы (SECURITY DEFINER):
- `is_linked_member(_owner uuid, _member uuid, _role app_role)` — есть ли связь.
- `get_my_owner_ids(_role app_role)` — список арендодателей, к которым привязан текущий юзер в указанной роли.

RLS на бизнес-таблицы (`properties`, `contracts`, `payments`, `tasks`, …) расширяется: к существующему `owner_id = auth.uid()` добавляется доступ менеджерам и арендаторам, привязанным к этому `owner_id` (через `is_linked_member`).

## 2. Регистрация: выбор «арендодатель / арендатор»

`/auth` (signup):
- Радио-кнопка: **Арендодатель** / **Арендатор**.
- При signup сохраняем выбор в `raw_user_meta_data.signup_role`.
- Триггер `handle_new_user` пересматривается: вместо безусловного `owner` добавляет только выбранную роль (`owner` или `tenant`). Если профиль уже существует (повторная регистрация той же почты с другой ролью невозможна — это тот же `auth.users`), просто докидывает недостающую роль в `user_roles`.
- Если пользователь хочет «вторую сторону» позже — главный привязывает его как арендатора (см. §4), и арендаторская роль добавится автоматически.

## 3. Вход: выбор роли перед входом

`/auth` (signin):
- Сначала радио «Войти как: Арендодатель / Арендатор» (по умолчанию — то, что было в прошлый раз, из `localStorage`).
- Затем email + пароль.
- После успешного `signIn` сервер‑fn `resolveLoginRole({ requested })` проверяет, что у юзера действительно есть выбранная роль; если нет — сообщение об ошибке и `signOut`.
- Выбранная роль сохраняется в `localStorage` (`active_account_kind`) и используется UI/навигацией для маршрутизации: `owner` → `/dashboard`, `tenant` → `/me`.

В шапке (`app-shell.tsx`) для пользователей с обеими ролями — переключатель «Аккаунт: Арендодатель / Арендатор», меняет `active_account_kind` и редиректит на нужный домашний экран.

## 4. Страница главного «Пользователи» (`/users`)

Доступ: роль `owner` (или `moderator`/`owner` через админ-флоу — см. §6).

Содержимое:
- Список «Мои менеджеры» и «Мои арендаторы» (из `user_links`).
- Кнопка «Привязать»: модалка с полями `email` + выбор роли (`manager` / `tenant`).
- Серверная fn `linkUserByEmail({ email, role })`:
  - находит `auth.users` по email через `supabaseAdmin.auth.admin.listUsers` (фильтр по email);
  - если нет — ошибка «Пользователь с такой почтой не зарегистрирован» (по решению — мгновенная привязка, без инвайтов);
  - вставляет запись в `user_links`;
  - upsert в `user_roles` соответствующей роли (`manager`/`tenant`), если её ещё нет;
  - пишет `activity_log` (`moderator_action` / `create`, `entity_type=user_link`).
- Кнопка «Отвязать» рядом с каждой строкой: удаляет запись `user_links`. Роль из `user_roles` не убираем (юзер может быть привязан и к другим арендодателям).

## 5. Множественная привязка арендатора → группировка + переключатель объекта

Дашборд арендатора `/me`:
- Сервер-fn `getTenantDashboard()` возвращает сводку по всем `owner_user_id`, к которым привязан текущий tenant: договоры, начисления, оплаты, объекты, документы.
- В UI секции группируются по арендодателю (заголовок = `profiles.full_name` арендодателя).
- В шапке `/me/*` — `<Select>` «Объект» со списком всех объектов из всех арендодателей (формат: «Название объекта — Арендодатель»). По умолчанию «Все объекты». Выбор хранится в search params (`?propertyId=`), фильтрует существующие списки.
- Существующие `/me/contracts`, `/me/charges`, `/me/calendar`, `/me/documents`, `/me/chat` читают через те же сервер-fn, фильтруют по `propertyId` если указан.

RLS для tenant: read-доступ к `contracts/payments/charges/properties/documents` любого `owner_id`, к которому он привязан как `tenant` (через `is_linked_member`).

Менеджер: read+write к данным `owner_id`, к которому привязан как `manager` (RLS соответственно).

## 6. Модератор: полный контроль над привязками

В админ-странице `/admin/user/$userId` добавить блок «Привязки»:
- Просмотр всех `user_links`, где этот user является `member_user_id` или `owner_user_id`.
- Кнопка «Привязать к арендодателю» — выбор арендодателя (поиск по email/имени) + роль; вызывает `moderatorLinkUser({ ownerUserId, memberUserId, role })`.
- Кнопка «Отвязать» — вызывает `moderatorUnlinkUser(linkId)`.
- Действие пишется в `activity_logs` как `moderator_action`.

Owner-only выдача ролей `developer`/`moderator` остаётся как есть. Модератор НЕ может выдавать `owner`/`developer`/`moderator` (защита на сервере).

## 7. Технические детали

- Миграция:
  1. `CREATE TABLE public.user_links` + GRANT (`authenticated`, `service_role`) + RLS.
     - SELECT: `auth.uid() = owner_user_id OR auth.uid() = member_user_id OR is_admin(auth.uid())`.
     - INSERT/DELETE: `auth.uid() = owner_user_id OR is_admin(auth.uid())`.
  2. Функции `is_linked_member`, `get_my_owner_ids` (SECURITY DEFINER, `search_path = public`).
  3. Обновить `handle_new_user`: читать `NEW.raw_user_meta_data->>'signup_role'`, дефолт `owner`, вставлять выбранную роль.
  4. Дополнить RLS на `properties`, `contracts`, `payments`, `charges`, `tasks`, `documents`, `tenants`, `budget_*`, `chat_threads`, `chat_messages`: оставить существующие политики и ДОБАВИТЬ доп. SELECT (для tenant — только SELECT; для manager — SELECT+INSERT+UPDATE+DELETE) через `is_linked_member(owner_id, auth.uid(), 'tenant'|'manager')`.
- Server fns:
  - `src/lib/account.functions.ts`: `resolveLoginRole`, `getMyAccountKinds`, `switchAccountKind` (фактически только валидация — выбор хранится клиентски).
  - `src/lib/user-links.functions.ts`: `listMyLinks`, `linkUserByEmail`, `unlinkUser`, `moderatorLinkUser`, `moderatorUnlinkUser`.
  - `src/lib/tenant-overview.functions.ts`: `getTenantDashboard`, `getTenantPropertyOptions`.
- UI:
  - `src/routes/auth.tsx` (или текущий signin/signup): радио ролей в обеих формах.
  - `src/routes/_authenticated/users.tsx` — новая страница «Пользователи» для owner.
  - `src/routes/_authenticated/me.*` — добавить селектор объекта (общий компонент `TenantPropertyPicker`), сгруппировать по арендодателю на главном.
  - `src/routes/_authenticated/admin.user.$userId.tsx` — блок «Привязки» + действия модератора.
  - `src/components/app-shell.tsx` — переключатель аккаунта, новый пункт «Пользователи» для owner, ветвление навигации по `active_account_kind`.
- `useDemoIdentity` оставить только для демо-режима; реальные роли/привязки берутся из БД.
- Логи: все `link/unlink` пишутся в `activity_logs` с `entity_type='user_link'`, `metadata={ owner_user_id, member_user_id, role }`.
- Безопасность: `linkUserByEmail` доступна только если `auth.uid()` имеет роль `owner` и привязывает к самому себе; модераторские варианты — отдельные fn с проверкой `is_admin`.

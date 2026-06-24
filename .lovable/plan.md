## Цель
Дать модератору (и developer/owner-admin) расширенные права в разделе «Пользователи»:
1. Создавать новый аккаунт (email + пароль + ФИО + стартовая роль).
2. Удалять аккаунт с подтверждением.
3. Добавлять модератором роль «арендатор» уже существующему арендодателю и привязывать его как арендатора к выбранному главному (на случай, если пользователь зарегистрировался не той ролью).

## Где меняем

### Backend — `src/lib/admin.functions.ts` (новые server fn)
- `adminCreateUser({ email, password, fullName, role: 'owner'|'tenant'|'manager'|'moderator'|'developer' })`
  - Проверка ролей вызывающего через `is_admin` / `has_role`.
  - `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, signup_role } })`.
  - Триггер `handle_new_user` создаст profile + базовую роль; затем `user_roles.upsert` для запрошенной роли, если она отличается от owner/tenant.
  - Логирование в `activity_logs` (action: `create`, entity_type: `user`).
- `adminDeleteUser({ userId })`
  - Только admin-роли, нельзя удалить себя.
  - `supabaseAdmin.auth.admin.deleteUser(userId)` (каскад уберёт profile/roles/links через FK on delete cascade — проверим в текущей схеме user_roles/user_links/profiles, они уже ссылаются `on delete cascade` на `auth.users`).
  - Лог в `activity_logs` (action: `delete`).
- `adminAddTenantRoleAndLink({ memberUserId, ownerUserId })`
  - Только admin-роли.
  - Добавляет роль `tenant` пользователю (`user_roles.upsert`) и создаёт связь `user_links(owner_user_id=ownerUserId, member_user_id=memberUserId, role='tenant')`.
  - Лог `moderator_action`.
  - (Аналогичный сценарий для роли `manager` уже покрывается `moderatorLinkUser`, дублировать не будем.)

Миграции не требуются — таблицы и политики уже есть; пишем только server-fn поверх `supabaseAdmin`.

### Frontend

`src/routes/_authenticated/admin.users.tsx` (страница «Пользователи» у модератора):
- Кнопка «Создать пользователя» → диалог с полями email, пароль (с генератором), ФИО, селект роли. Submit → `adminCreateUser` → invalidate `admin-users`, toast.
- В строке таблицы — кнопка «Удалить» с `ConfirmButton` (destructive). Скрываем для текущего пользователя.
- В строке таблицы — кнопка «Сделать арендатором у…» → диалог: селект арендодателя (из текущего списка `listAllUsers`, фильтр по роли `owner`). Submit → `adminAddTenantRoleAndLink` → invalidate.

`src/routes/_authenticated/admin.user.$userId.tsx` (детальная):
- В уже существующем табе «Привязки» добавить кнопку «Привязать как арендатора к арендодателю …» (форма выбора owner) — использует тот же `adminAddTenantRoleAndLink`.
- Добавить кнопку «Удалить аккаунт» с подтверждением (если не сам себе) → `adminDeleteUser` → redirect на `/admin/users`.

UX: все confirm-модалки через существующий `ConfirmButton`, диалоги через `Dialog` shadcn, тосты через `sonner`.

## Безопасность
- Все новые server-fn используют `requireSupabaseAuth` + проверку `is_admin(userId)` до любых действий.
- `supabaseAdmin` импортируется только внутри `.handler()` (правило client.server).
- Запрет удаления себя и понижения собственных admin-прав на этом этапе (отдельные кнопки скрываем для `context.userId === target`).

## Что не трогаем
- Схема БД, RLS, регистрация (`auth.tsx`), self-service страница `/users` для арендодателя.
- Демо-режим: новые админ-действия не имитируются (нужен реальный логин с admin-ролью).
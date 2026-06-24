
# Логи действий + роли developer / moderator

## 1. Роли

Расширить enum `app_role`:
- `developer` — read-only администратор: видит данные любого пользователя и все логи, ничего не меняет.
- `moderator` — администратор с правом изменять данные любого пользователя (профиль, бизнес-данные, роли/доступ), кроме выдачи роли `developer`.
- `owner` (существует) — единственный, кто может выдавать/забирать роли `developer` и `moderator`.

UI управления ролями (новая страница `/users`, доступна owner) — список зарегистрированных пользователей с переключателем ролей.

## 2. База данных логов

Новая таблица `public.activity_logs`:
- `user_id` — кто совершил действие (auth.users.id, nullable для системных)
- `acted_as_user_id` — если действие сделано в режиме имперсонации, чьим лицом
- `action` — enum: `login`, `logout`, `create`, `update`, `delete`, `view`, `moderator_action`
- `entity_type` — `property`, `tenant`, `contract`, `payment`, `budget`, `task`, `profile`, `user_role`, `page`, …
- `entity_id` — uuid затронутой записи (nullable)
- `route` — путь страницы (для `view`)
- `metadata` — jsonb: diff полей, имя сущности, IP/UA
- `created_at`

RLS:
- INSERT — любой authenticated (через server fn, который сам подставляет `user_id`).
- SELECT — только `developer`, `moderator`, `owner` (через `has_role`).
- UPDATE/DELETE — запрещено.

GRANT-блок по правилам проекта.

## 3. Запись логов

Server functions в `src/lib/activity-log.functions.ts`:
- `logActivity({ action, entity_type, entity_id?, route?, metadata? })` — общий писатель, использует `requireSupabaseAuth`.
- Хук `useLogPageView()` в `__root.tsx` или `_authenticated/route.tsx` — пишет `view` при смене маршрута (дебаунс, исключить auth-страницы).
- Обернуть существующие mutations (create/update/delete properties, tenants, contracts, payments, budgets, tasks, profile, user_roles) вызовом `logActivity` в `onSuccess`. Для auth — слушатель `onAuthStateChange` в `__root.tsx` пишет `login`/`logout`.

## 4. Страница логов `/admin/logs`

Доступ: `developer | moderator | owner`. Под `_authenticated/`.
- Таблица: дата, пользователь (имя + email), действие, сущность, объект, маршрут, кнопка «детали» (раскрывает metadata diff).
- Фильтры в search params (zodValidator + fallback): период (с/по), пользователь, действие, тип сущности, поиск по тексту.
- Пагинация (по 50, курсорная по `created_at`).
- Серверная функция `getActivityLogs` с теми же фильтрами.

## 5. Админ-страница «глазами пользователя» `/admin/users/$userId`

Доступ: `developer | moderator | owner`. Отдельная страница, без переключения сессии.
- Шапка: профиль пользователя, его роли, дата регистрации, последняя активность.
- Табы: Объекты, Арендаторы, Договоры, Оплаты, Бюджет, Задачи, Документы, Логи (фильтр по этому user_id).
- Данные читаются server fn `getUserOverview(userId)` под `requireSupabaseAuth`, внутри проверяется `has_role(viewer, developer|moderator|owner)` и используется `supabaseAdmin` для чтения данных нужного пользователя (RLS обходится только для просмотра).
- Кнопки редактирования (профиль, бизнес-данные, роли) видны только `moderator | owner`. Для `developer` всё read-only. Запись делается server fn `moderatorUpdate*` с проверкой роли и логированием как `moderator_action` с `acted_as_user_id = userId`.
- Owner-only: блок управления ролями `developer` / `moderator`.

## 6. Навигация и доступ

- В `app-shell.tsx` добавить раздел «Администрирование» (Логи, Пользователи), показывать только если `has_role(developer|moderator|owner)`.
- Маршруты `/admin/*` под `_authenticated/`, доп. проверка роли в каждом loader через server fn `requireAdminRole`; при отказе — редирект на `/dashboard`.
- `useDemoIdentity` оставить как есть для arendator/manager демо; новые роли берутся из БД `user_roles`, не из localStorage.

## Технические детали

- Миграция: `ALTER TYPE app_role ADD VALUE 'developer'; ADD VALUE 'moderator';` (отдельной транзакцией), затем создание `activity_logs`, GRANT, RLS, индексы (`created_at desc`, `user_id`, `entity_type, entity_id`).
- Хелпер `public.is_admin(uid)` SECURITY DEFINER → `has_role(uid,'developer') OR has_role(uid,'moderator') OR has_role(uid,'owner')` для использования в RLS и server fn.
- Server fn `moderatorUpdate*` использует `supabaseAdmin` (через `await import("@/integrations/supabase/client.server")` внутри handler), сначала проверяет роль вызывающего, потом пишет данные и лог.
- Логи view дебаунсятся 500мс, не пишутся для `/auth` и `/admin/logs`, чтобы избежать шума.
- Diff в metadata: для update сохраняем `{ before: {...}, after: {...} }` только по изменённым полям.
- Все новые страницы — на тех же shadcn-компонентах (Table, Card, Tabs, Select, DatePicker), `formatMoney` где уместно.

## Кнопка уведомлений

Добавить колокольчик с бейджем непрочитанных в шапке (видимый на всех страницах), хранить уведомления в БД, генерировать их триггерами на ключевые события и подписываться на realtime.

### 1. БД (миграция)

Таблица `notifications`:
- `user_id` (uuid, кому) — индекс
- `kind` (text): `alert | account | property | tenant | contract | charge | indexation | chat`
- `title` (text), `body` (text, опц.)
- `entity_table`, `entity_id` (для ссылки)
- `route` (text, куда вести по клику)
- `read_at` (timestamptz, null = непрочитано)
- `created_at`

GRANT для `authenticated` + `service_role`. RLS: пользователь видит/обновляет/удаляет только свои строки (`user_id = auth.uid()`), INSERT через service_role/триггеры.

Триггеры (SECURITY DEFINER), для каждого ключевого события вставляют по строке каждому получателю:
- `properties` AFTER INSERT → арендодатель (owner_id) + связанные менеджеры через `user_links`
- `tenants` AFTER INSERT → то же
- `contracts` AFTER INSERT → то же
- `charges` AFTER INSERT → арендодатель/менеджеры + арендатор контракта; `kind='indexation'` если `meta`/тип = индексация, иначе `charge`
- `chat_messages` AFTER INSERT → второй стороне треда (если sender=tenant → owner/менеджеры, если owner/manager → tenant)
- `activity_logs` AFTER INSERT с `action in ('login','password_change',...)` → владельцу аккаунта (`account`)

### 2. Server functions (`src/lib/notifications.functions.ts`)
- `listMyNotifications({ limit })` — последние N
- `getUnreadCount()`
- `markRead({ ids })` / `markAllRead()`
- `deleteNotification({ id })`

Все с `requireSupabaseAuth`, фильтр `user_id = context.userId`.

### 3. UI

Новый компонент `src/components/notifications-bell.tsx`:
- Иконка `Bell` (lucide) + красный бейдж с количеством непрочитанных
- Popover со списком (заголовок, текст, относительное время, иконка по `kind`)
- Клик по пункту → `markRead` + `navigate(route)`
- Кнопки «Прочитать всё» и «Очистить»
- React Query: `useQuery` для списка/счётчика (staleTime 30с) + Supabase realtime подписка на `notifications` для текущего `user_id`, инвалидирует кэш при INSERT/UPDATE → «одноразовые» (показывается, пока не прочитано, потом исчезает из badge)
- Toast (sonner) при новом INSERT через realtime

Размещение: в `src/components/app-shell.tsx` — добавить колокольчик в десктоп-сайдбар рядом с `IdentitySwitcher` и в мобильную шапку рядом с `ROLE_LABELS[role]`.

### Технические детали
- Realtime: `supabase.channel('notif:'+userId).on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.'+userId }, ...)`
- Получатели в триггерах вычисляются через `user_links` (member_user_id для роли owner/manager) + сам `owner_id`
- Для чатов: получатель — `tenant_user_id` или `owner_user_id` треда (поля уже есть в `chat_threads`)
- Маршруты в `route`: `/properties/:id`, `/tenants/:id`, `/contracts/:id`, `/charges/:id`, `/chats` и т.д.

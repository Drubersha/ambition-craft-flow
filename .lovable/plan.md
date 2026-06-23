## Демо-режим без логина, роли, чат и кабинет арендатора

Большой апдейт: убираем экран входа, вводим переключатель ролей, чат с вложениями и личный кабинет арендатора.

---

### 1. Демо-режим (без авторизации)

- Удаляется экран `/auth` и редирект-гейт `_authenticated/route.tsx` заменяется на простой layout без проверки сессии.
- Все маршруты становятся публичными (роуты остаются в той же папке, чтобы не править дерево).
- Сверху приложения — **селектор личности** (в шапке AppShell):
  - Роль: **Главный** / **Менеджер** / **Арендатор**
  - Если «Арендатор» — второй селект: какой именно (список из таблицы `tenants`).
- Текущая личность хранится в `localStorage` (`demo.role`, `demo.tenantId`) и в React-контексте `DemoIdentityProvider`. Меняется мгновенно, без перезагрузки.
- Существующий триггер `handle_new_user` остаётся, но больше не выстреливает (никто не регистрируется). RLS-политики переделываются на permissive (`USING (true)`) — это демо, безопасность не цель этой итерации; в плане явно помечаем как demo-only.

> ⚠️ Важно: «убрать авторизацию» + «личный кабинет арендатора» совмещаются именно через демо-селектор. Реальный логин арендаторов можно вернуть позже.

### 2. Система ролей

- Новый enum `app_role` уже есть (`owner`). Расширяем до `owner | manager | tenant`.
- В демо-режиме роль берётся не из БД, а из контекста личности (`useDemoIdentity()`).
- Утилита `can(role, action)` и хук `useRole()`:
  - `owner`, `manager` — видят всё (объекты, арендаторов, договоры, начисления, платежи, воронку, чаты со всеми).
  - `tenant` — видит только свои данные + чат с управляющим.
- Боковое меню в `AppShell` рендерится в зависимости от роли:
  - **Owner/Manager**: текущие пункты + новый «Чаты».
  - **Tenant**: «Мой кабинет», «Мои договоры», «Мои начисления», «Календарь», «Документы», «Чат».

### 3. Привязка tenant ↔ identity (автосоздание)

- В таблицу `tenants` добавляется `user_id uuid NULL` (на будущее) и `slug` (генерируется при создании договора, используется в demo-селекторе и в ссылках вида «просмотр от лица арендатора»).
- При создании договора:
  - Если у выбранного Tenant ещё нет `slug` — генерируем.
  - В демо-режиме `user_id` не заполняется; идентичность арендатора = `tenant.id` в `localStorage`.
- На странице договора `contracts.$id.tsx` — новая кнопка **«Просмотр от лица арендатора»**: переключает `demo.role='tenant'`, `demo.tenantId=<contract.tenant_id>` и навигирует на `/me`.

### 4. Чат с вложениями

Новые таблицы:

- `chat_threads` — `id`, `tenant_id` (unique), `last_message_at`, `unread_owner`, `unread_tenant`.
- `chat_messages` — `id`, `thread_id`, `sender_role` (`owner|manager|tenant`), `sender_label` (имя для отображения), `body text`, `created_at`, `read_at`.
- `chat_attachments` — `id`, `message_id`, `storage_path`, `file_name`, `mime`, `size_bytes`.

Хранилище:
- Новый bucket `chat-attachments` (private), путь `<thread_id>/<message_id>/<filename>`.

Realtime:
- `ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;` — для живых обновлений.
- На странице чата — подписка через `useEffect`, очистка через `removeChannel`.

UI:
- **`/chats`** (owner/manager): двухколоночная панель — слева список тредов (по всем арендаторам, бейдж непрочитанных, поиск), справа выбранный тред с сообщениями, инпут текста + кнопка «📎» для аплоада.
- **`/me/chat`** (tenant): один тред этого арендатора, тот же компонент сообщений.
- Сообщения: пузырьки слева/справа в зависимости от роли отправителя относительно текущей личности, вложения рендерятся как карточки (изображения — превью, остальное — иконка+имя+скачать).
- Тред арендатору автосоздаётся при первом открытии его кабинета.

### 5. Кабинет арендатора

Новый layout `/me` (рендерится только если `role==='tenant'`):

- **`/me`** — дашборд: ближайший платёж, текущий долг, активный договор.
- **`/me/contracts`** — список своих договоров (фильтр по `tenant_id = demo.tenantId`), карточка объекта.
- **`/me/charges`** — свои начисления (сумма, период, статус, оплачено/осталось). Без кнопок редактирования.
- **`/me/calendar`** — календарный вид (`date-fns` + сетка месяца, навигация по месяцам):
  - дни с предстоящими `charges.due_date` (синие точки)
  - просрочки (красные)
  - оплаченные (зелёные)
  - клик по дню → список начислений за этот день.
- **`/me/documents`** — список документов по своим договорам (скачивание из bucket `documents`).
- **`/me/chat`** — чат с управляющим (см. п.4).

Шапка в кабинете арендатора показывает ФИО арендатора и кнопку «Выйти из режима арендатора» (возвращает на роль `owner` в селекторе).

### 6. Изменения в существующих страницах

- `app-shell.tsx` — селектор личности + динамическое меню по роли.
- `contracts.$id.tsx` — кнопка «Просмотр от лица арендатора».
- `_authenticated/route.tsx` — упрощается до `<AppShell><Outlet/></AppShell>` без `getUser`.
- `auth.tsx`, `index.tsx` — удаляются (или `index.tsx` редиректит на `/dashboard` для owner / `/me` для tenant).
- Все серверные функции с `requireSupabaseAuth` (если есть) — переводим на публичные `createServerFn` с проверкой `data.actorRole` из тела запроса. (Сейчас, судя по коду, серверных функций мало; основная работа — через клиент `supabase`.)

---

### Технические детали

**Миграция (одной транзакцией):**

```text
- расширить enum app_role значениями manager, tenant
- ALTER TABLE tenants ADD COLUMN user_id uuid, ADD COLUMN slug text UNIQUE
- CREATE TABLE chat_threads (...) + GRANT + RLS(USING true)
- CREATE TABLE chat_messages (...) + GRANT + RLS(USING true)
- CREATE TABLE chat_attachments (...) + GRANT + RLS(USING true)
- триггер touch_updated_at на chat_threads
- триггер: после insert в chat_messages — обновить last_message_at и unread_*
- ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages
- Permissive RLS на существующих таблицах (USING true) — пометить комментарием "demo mode"
```

**Bucket:** `chat-attachments` (private) + storage RLS USING true (demo).

**Файлы (новые):**

```text
src/lib/demo-identity.tsx          — провайдер + хуки роли/арендатора
src/lib/role.ts                    — типы, can()
src/components/identity-switcher.tsx
src/components/chat/thread-list.tsx
src/components/chat/message-list.tsx
src/components/chat/message-composer.tsx
src/components/chat/attachment-card.tsx
src/routes/_authenticated/chats.index.tsx
src/routes/_authenticated/me.tsx              (layout)
src/routes/_authenticated/me.index.tsx        (дашборд)
src/routes/_authenticated/me.contracts.tsx
src/routes/_authenticated/me.charges.tsx
src/routes/_authenticated/me.calendar.tsx
src/routes/_authenticated/me.documents.tsx
src/routes/_authenticated/me.chat.tsx
```

**Файлы (правка):**

```text
src/components/app-shell.tsx          — селектор, динамическое меню
src/routes/_authenticated/route.tsx   — без проверки auth
src/routes/_authenticated/contracts.$id.tsx — кнопка «От лица арендатора»
src/routes/__root.tsx                 — обернуть в DemoIdentityProvider
src/routes/index.tsx                  — простой редирект по роли
```

**Удаляется:** `src/routes/auth.tsx` (и упоминания в навигации).

### Вне scope

- Реальная аутентификация арендаторов (вернём, когда понадобится).
- Уведомления на e-mail/push о новых сообщениях.
- Групповые чаты, реакции, редактирование/удаление сообщений.
- Подписание договора арендатором, онлайн-оплата.
- Тонкая безопасность RLS (сейчас демо — permissive).

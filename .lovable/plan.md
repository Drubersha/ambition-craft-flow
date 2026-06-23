## Канбан задач + ИИ-анализ чата

### Что строим

Новый раздел «Задачи» — канбан-доска с колонками: Принято → В процессе → На проверке → Готово → Архив. Видят только главный и менеджер. ИИ автоматически анализирует каждое новое сообщение арендатора (текст + фото) и предлагает создать задачу.

### База данных (миграция)

Таблица `tasks`:
- `tenant_id` (uuid, FK на tenants, nullable — общие задачи без арендатора возможны)
- `thread_id` (uuid, nullable — из какого чата)
- `source_message_id` (uuid, nullable — исходное сообщение)
- `title` (text), `description` (text)
- `status` enum `task_status`: `accepted | in_progress | review | done | archived`
- `priority` enum: `low | normal | high`
- `photo_paths` (text[]) — пути в bucket `chat-attachments`, переносятся из сообщения
- `position` (int) — порядок внутри колонки
- `created_at`, `updated_at`, триггер `touch_updated_at`

Таблица `task_suggestions` (предложения ИИ, ждут подтверждения):
- `tenant_id`, `thread_id`, `source_message_id`
- `title`, `description`, `priority`, `photo_paths` (text[])
- `status`: `pending | accepted | dismissed`
- `model`, `created_at`

Обе таблицы: `GRANT` для authenticated и service_role, RLS `USING true` (демо-режим, как остальные).

В `chat_messages` добавим колонку `analyzed_at timestamptz` чтобы не анализировать дважды.

### Серверная функция ИИ

`src/lib/tasks.functions.ts`:
- `analyzeMessage({ messageId })` — `createServerFn`, публичный (демо). Загружает сообщение, его вложения, последние 5 сообщений треда для контекста. Если есть фото — подписывает временные URL и передаёт в Gemini как `image_url`. Если сообщение от owner/manager — пропускает.
- Модель: `google/gemini-2.5-flash` через Lovable AI Gateway (`createLovableAiGatewayProvider`, `generateText` + `Output.object` со схемой Zod: `{ is_task: boolean, title, description, priority }`).
- Если `is_task`, создаёт строку в `task_suggestions` с привязкой к `photo_paths` сообщения. Помечает `chat_messages.analyzed_at`.
- `acceptSuggestion({ id })` — переносит в `tasks` (status=`accepted`), фото копируются по ссылке (тот же storage path), suggestion → `accepted`.
- `dismissSuggestion({ id })`, `updateTaskStatus({ id, status, position })`, `archiveTask`, `deleteTask`.

Автотриггер: в `ChatThread.send()` после успешной вставки сообщения арендатором (или в общем потоке — для всех неанализированных tenant-сообщений) вызывается `analyzeMessage` fire-and-forget. Также раз в открытии страницы чатов — добивка непроанализированных через realtime listener `chat_messages` INSERT.

`LOVABLE_API_KEY` уже есть в секретах.

### UI

**Новый маршрут** `src/routes/_authenticated/tasks.index.tsx`:
- Канбан из 5 колонок (drag&drop через `@dnd-kit/core` + `@dnd-kit/sortable` — добавим зависимости).
- Карточка задачи: title, превью первого фото, имя арендатора, бейдж приоритета, кнопки «В архив»/«Удалить».
- Фильтр сверху: «Все арендаторы / выбрать одного» (Select по `tenants`).
- Колонка «Архив» свёрнута по умолчанию (скрыта за раскрывающимся блоком).
- Drag между колонками меняет `status` через `updateTaskStatus`; внутри колонки — `position`.
- Realtime: подписка на `tasks` INSERT/UPDATE → invalidate query.

**Панель предложений ИИ** (в `tasks.index.tsx` сверху):
- Список `task_suggestions` со `status=pending`. Каждое: title, description, превью фото, ссылка «Открыть чат», кнопки «Создать задачу» / «Отклонить».
- Realtime на `task_suggestions`.

**Бейдж предложений в навигации**: пункт «Задачи» в `OWNER_NAV` (иконка `KanbanSquare`) с badge числа pending suggestions.

**В чатах** (`chats.index.tsx` и `ChatThread`): на каждом сообщении арендатора маленькая кнопка «➕ Задача» — ручной вызов `analyzeMessage` или прямое создание (откроет суггест).

### Файлы

Новые:
- `supabase/migrations/<ts>_tasks.sql`
- `src/lib/tasks.functions.ts`
- `src/lib/ai-gateway.server.ts` (хелпер провайдера)
- `src/components/tasks/kanban-board.tsx`, `task-card.tsx`, `suggestions-panel.tsx`
- `src/routes/_authenticated/tasks.index.tsx`

Изменения:
- `src/components/app-shell.tsx` — пункт «Задачи» + бейдж
- `src/components/chat/chat-thread.tsx` — кнопка «Создать задачу» на сообщении + авто-анализ после insert
- `src/integrations/supabase/types.ts` — после миграции регенерируется
- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `ai`, `@ai-sdk/openai-compatible`, `zod` (если ещё нет)

### Вне рамок

- Назначение задачи на конкретного менеджера (только статусы)
- Сроки и напоминания
- Видимость задач арендатору
- Полноценный аудит-лог

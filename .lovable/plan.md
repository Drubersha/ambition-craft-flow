## Воронка продаж (Канбан лидов)

Новая страница `/leads` с канбан-доской потенциальных арендаторов. Лиды проходят 5 этапов; на финальном создаются Tenant + черновик договора.

### Этапы воронки
1. Спросил в агрегаторе
2. Приехал посмотреть
3. Дал документы (паспорт/ИНН)
4. Получил договор — ожидается подпись
5. Вернул подписанный договор → лид закрывается успешно (создаётся Tenant + Contract draft)

На каждом этапе кнопки **Прошёл** / **Не прошёл**. «Не прошёл» открывает диалог с обязательным комментарием → лид уходит в архив (скрыт из канбана, доступен через фильтр «Архив»).

### Карточка лида
- ФИО (обязательно)
- Телефон, email
- ИНН (появляется/требуется на этапе 3)
- Источник: Avito, Циан, Яндекс.Недвижимость, Рекомендация, Сайт, Другое
- Бюджет (₽/мес) и желаемая площадь (м²)
- Объект (property_id) — обязателен
- Комментарий
- История переходов между этапами (со временем и комментарием при отказе)

### База данных (новая миграция)
Таблица `public.leads`:
- `id`, `user_id` (auth.uid), `created_at`, `updated_at`
- `full_name`, `phone`, `email`, `inn`
- `source` (enum `lead_source`: avito, cian, yandex, referral, website, other)
- `budget` numeric, `desired_area` numeric
- `property_id` → properties (NOT NULL)
- `stage` (enum `lead_stage`: inquiry, viewing, documents, contract_sent, signed)
- `status` (enum `lead_status`: active, archived, won)
- `archived_reason` text, `archived_at` timestamptz
- `tenant_id` → tenants (nullable, заполняется при won)
- `contract_id` → contracts (nullable)

Таблица `public.lead_events` (история этапов):
- `id`, `lead_id`, `from_stage`, `to_stage`, `passed` bool, `comment` text, `created_at`, `created_by`

GRANT на обе таблицы для `authenticated` и `service_role`. RLS: владелец видит/правит только свои записи (`user_id = auth.uid()`); для `lead_events` — через JOIN на `leads.user_id`.

### UI
Новый роут `src/routes/_authenticated/leads.index.tsx`:
- Заголовок + кнопка «Новый лид» (диалог формы)
- Переключатель «Активные / Архив»
- 5 колонок канбана (горизонтальный скролл на мобильном)
- Карточка: имя, источник-бейдж, объект, телефон, кнопки «Прошёл»/«Не прошёл»
- «Прошёл» на этапе 5 → диалог подтверждения → транзакция: create tenant (ФИО, телефон, email, ИНН) + create contract draft (property_id, tenant_id, status='draft') + update lead (status='won', tenant_id, contract_id)
- «Не прошёл» → диалог с textarea для причины → status='archived'
- Drag-and-drop НЕ делаем в этой итерации (только кнопки) — упрощает логику и валидацию ИНН на 3-м этапе

Пункт «Воронка» добавляется в боковое меню (`src/components/app-shell.tsx`).

### Валидация (zod)
- `full_name`: 1–200
- `phone`: 5–32, маска свободная
- `email`: optional, email format
- `inn`: 10 или 12 цифр (обязателен на переходе → этап 3)
- `budget`, `desired_area`: >= 0
- `archived_reason`: 1–500 при отказе

### Файлы
- Миграция: таблицы `leads`, `lead_events`, enums, RLS, GRANT, триггер `updated_at`
- `src/routes/_authenticated/leads.index.tsx` — канбан
- `src/components/lead-form.tsx` — диалог создания/редактирования
- `src/components/app-shell.tsx` — пункт меню «Воронка»

### Вне scope
- Drag-and-drop между колонками
- Email/SMS уведомления
- Назначение менеджеров (нет multi-user сценариев в проекте)
- Импорт лидов из агрегаторов
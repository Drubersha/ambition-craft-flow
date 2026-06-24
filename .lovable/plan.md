## Проблема

`signInAsDemo()` вызывает `ensureDemoAccount()` ДО `signInWithPassword`. Но `ensureDemoAccount` теперь защищён `requireSupabaseAuth` + проверкой роли `developer`. Новый посетитель не авторизован → нет Bearer → 401 → demo-вход падает. Это логическое противоречие: «нужен developer, чтобы войти как developer».

## Решение: сидинг demo-аккаунтов в миграции, клиент только логинится

Demo-аккаунты — это фиксированный набор из 4 заранее известных email'ов. Нет причины создавать их по требованию из браузера. Создадим их один раз в миграции (через Auth Admin внутри plpgsql/SQL-сидинга или через server-only seed), и клиент будет просто звать `signInWithPassword`. Provisioning остаётся доступен только разработчику из админки.

### Шаги

**1. Миграция — сидинг demo-пользователей**

Создать миграцию, которая идемпотентно вставляет 4 demo-пользователя в `auth.users` через `supabase_auth_admin`-доступный путь. Поскольку прямой `INSERT INTO auth.users` хрупкий, используем подход: SQL-функция `public._seed_demo_user(email, password, full_name, roles[])` с `SECURITY DEFINER`, владелец `postgres`, которая:
   - находит/создаёт запись в `auth.users` (через `auth.users` insert с захешированным паролем — bcrypt через `crypt()` + `gen_salt('bf')`, расширение `pgcrypto` уже есть),
   - подтверждает email (`email_confirmed_at = now()`),
   - upsert в `public.profiles`,
   - upsert ролей в `public.user_roles`.

Затем в миграции вызвать её 4 раза для `demo / demo2 / moderator / developer` с теми же паролями, что в `DEMO_ACCOUNTS`. После сидинга — `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` на самой функции (вызывать её сможет только service_role / суперпользователь).

Пароли demo-аккаунтов и так публично известны (это демо), коммитить их в миграцию допустимо.

**2. `src/lib/demo-auth.ts` — упростить клиент**

```ts
export async function signInAsDemo(kind: DemoKind): Promise<void> {
  const acc = DEMO_ACCOUNTS[kind];
  const { error } = await supabase.auth.signInWithPassword({
    email: acc.email, password: acc.password
  });
  if (error) {
    throw new Error("Демо-аккаунт недоступен. Обратитесь к администратору.");
  }
  // ... localStorage + redirect как сейчас
}
```

Никакого `ensureDemoAccount` на пути входа. Никакого импорта `client.server.ts`.

**3. `src/lib/demo-auth.functions.ts` — оставить, но только для админки**

`ensureDemoAccount` остаётся как есть (developer-only) — для ручного «починить/пересоздать demo» из админ-панели. `resetDemo2Account` остаётся как есть (demo2-сам-себя или developer) — он вызывается уже из авторизованной сессии demo2, всё корректно.

**4. UX gate в `src/routes/auth.tsx`**

Не меняется. По-прежнему просим `admin/admin` или `demo/demo`, потом зовём `signInAsDemo`. Сообщение об ошибке станет понятным благодаря изменению из шага 2.

**5. Проверка для всех 4 ролей**

После применения миграции:
- `demo` → роли `[owner]` → редирект `/dashboard`
- `demo2` → роли `[owner]` → `/dashboard` (демо2-очистка работает, т.к. вызывается уже авторизованным demo2)
- `moderator` → роли `[moderator, owner]` → `/admin/users`
- `developer` → роли `[developer, owner]` → `/admin/users`

`DemoIdentityProvider` уже корректно сверяет роль с сервером через `getMyRoles`.

## Безопасность

- Service-role ключ не покидает сервер.
- `ensureDemoAccount` остаётся developer-only — abuse невозможен.
- Публичной server function, создающей произвольных пользователей, нет вообще.
- Сидинг ограничен 4 захардкоженными email'ами в миграции.
- SECURITY DEFINER seed-функция после использования теряет EXECUTE для anon/authenticated.

## Технические детали (для разработчика)

Файлы:
- `supabase/migrations/<timestamp>_seed_demo_accounts.sql` — новая миграция.
- `src/lib/demo-auth.ts` — убрать `ensureDemoAccount` из пути входа, улучшить ошибку.
- `src/lib/demo-auth.functions.ts` — без изменений (либо мелкая правка комментария).
- `src/routes/auth.tsx` — без изменений.

Проверка: `bun run lint`, `bun run build`, ручной прогон 4 demo-входов в чистой сессии.

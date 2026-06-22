
# План: развёртывание RentFlow на своём сервере (Docker + self-hosted Supabase)

Цель: получить рабочий стек на вашем VPS — отдельный контейнер с приложением (TanStack Start) и отдельная связка контейнеров Supabase (Postgres, GoTrue Auth, PostgREST, Storage, Studio, Kong) — и залить всё это в `github.com/Drubersha/RentFlow`.

## Что добавляется в проект

1. **`Dockerfile`** — multi-stage сборка приложения:
   - стадия `deps`: `oven/bun:1` + `bun install --frozen-lockfile`
   - стадия `build`: `bun run build` (Vite + Nitro → `.output/`)
   - стадия `runtime`: `node:22-alpine`, копируется только `.output/`, запуск `node .output/server/index.mjs` на порту 3000
   - переменные окружения читаются в рантайме (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_*` — последние нужны и на build-стадии, т.к. Vite инлайнит их в клиент)

2. **`.dockerignore`** — `node_modules`, `.output`, `dist`, `.git`, `.env*`, `*.log`, `supabase/.branches`, `.vinxi`.

3. **`docker-compose.yml`** — поднимает всё на сервере:
   - `app` — наш Dockerfile, порт `3000`, зависит от `kong`
   - `db` — `supabase/postgres:15`, том `db-data`
   - `auth` — `supabase/gotrue` (email/password, JWT)
   - `rest` — `postgrest/postgrest` (Data API)
   - `storage` — `supabase/storage-api` + бакет `documents`
   - `kong` — `kong:2.8` API gateway, проксирует `/auth/v1`, `/rest/v1`, `/storage/v1` на порту `8000`
   - `studio` — `supabase/studio` (опционально, для админки)
   - `meta` — `supabase/postgres-meta` (нужен Studio)
   - общий `.env` для compose с `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SITE_URL`

4. **`supabase/volumes/`** — конфиги, которые монтируются в контейнеры:
   - `kong.yml` — маршруты API gateway
   - `db/init/` — символическая ссылка/копия на ваши миграции из `supabase/migrations/` (применяются при первом старте Postgres)

5. **`.env.example`** — шаблон всех переменных для self-hosted установки (без секретов).

6. **`README.deploy.md`** — пошаговая инструкция: клон репо → заполнить `.env` → `docker compose up -d` → применить миграции → создать первого пользователя.

## Что НЕ меняется в коде приложения

Архитектурно код остаётся прежним — Supabase JS SDK работает с любым Supabase (Lovable Cloud или self-hosted) идентично. Меняются только переменные окружения:
- `VITE_SUPABASE_URL` → `https://yourdomain.com` (или `http://server-ip:8000`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` → ваш сгенерированный `ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` → ваш сгенерированный `SERVICE_ROLE_KEY`

Файлы `src/integrations/supabase/*` НЕ трогаем (они auto-generated).

## Как залить в GitHub

Lovable уже умеет двусторонний sync с GitHub. Поскольку у вас уже есть `github.com/Drubersha/RentFlow`, нужно либо:
- **(A)** подключить его через меню Lovable: `+` → GitHub → Connect project → выбрать существующий репозиторий. После этого все правки, которые я внесу (Dockerfile, compose и т.д.), автоматически уедут туда push'ем.
- **(B)** если sync уже настроен — ничего делать не нужно, файлы уедут сами.

Lovable не поддерживает «импорт» существующего репо с историей — он привязывает Lovable-проект к репозиторию и push'ит туда свой код. Если в `Drubersha/RentFlow` уже есть код другой версии, его придётся либо очистить, либо принять merge-конфликт вручную через `git`.

## Развёртывание на сервере (что вы делаете руками)

Так как Docker у вас ещё не установлен:
1. Поставить Docker Engine + compose plugin (одна команда из docs.docker.com для вашего дистрибутива).
2. `git clone https://github.com/Drubersha/RentFlow.git && cd RentFlow`
3. `cp .env.example .env`, сгенерировать `JWT_SECRET` (`openssl rand -base64 48`), затем `ANON_KEY` и `SERVICE_ROLE_KEY` (через Supabase JWT generator или прилагаемый скрипт).
4. `docker compose up -d`
5. (опционально) Nginx/Caddy перед `app:3000` для HTTPS-домена.

## Технические детали

- **Build-time vs runtime env.** `VITE_*` переменные Vite инлайнит на этапе `bun run build`, поэтому в Dockerfile они передаются как `ARG` + `ENV` на build-стадии. Серверные (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) читаются `process.env` в рантайме внутри `createServerFn` — их даём через `environment:` в compose.
- **Cloudflare Workers vs Node.** Текущий `vite.config.ts` собирает под Cloudflare. Для Node-рантайма в `Dockerfile` build-стадия будет вызывать сборку с Nitro Node preset (через переменную `NITRO_PRESET=node-server`) — изменение `vite.config.ts` не требуется, Nitro слушает env.
- **Миграции.** Файлы из `supabase/migrations/*.sql` будут смонтированы в `/docker-entrypoint-initdb.d/` контейнера Postgres — применятся при первом запуске. Для последующих миграций — `supabase db push` локально против сервера, либо `psql` руками.
- **Storage bucket `documents`.** Создаётся init-скриптом, т.к. в self-hosted нет автоконфигурации бакетов.
- **OAuth (Google).** В self-hosted Supabase Auth настраивается через переменные `GOTRUE_EXTERNAL_GOOGLE_*` в compose. Email/password работает из коробки.

## Что я НЕ буду делать сейчас

- Не трогаю код приложения и схему БД.
- Не настраиваю HTTPS/Nginx (это зависит от вашего домена — добавлю в README отдельной секцией с примером Caddyfile).
- Не генерирую секреты в репозитории — только `.env.example` с плейсхолдерами.

После апрува плана я создам 5 файлов (`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `README.deploy.md`) и конфиг `supabase/volumes/kong.yml`. Ничего из существующего кода не меняется.

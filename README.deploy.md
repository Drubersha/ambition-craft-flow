# Self-hosting RentFlow

Полностью автономный стек: приложение + Supabase в Docker на вашем сервере.

## 0. Требования на сервере

- Linux (Ubuntu 22.04 / 24.04 рекомендуется), 2 vCPU, 4 GB RAM, 20 GB диск.
- Docker Engine + Docker Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```
- Открытые порты: `3000` (приложение), `8000` (Supabase API gateway). Для прод — закройте за Nginx/Caddy с HTTPS.

## 1. Подключение GitHub к Lovable

В редакторе Lovable: меню `+` (внизу слева) → **GitHub** → **Connect project** → выбрать `Drubersha/RentFlow`. Все правки из Lovable автоматически пушатся в этот репозиторий.

Если в репо уже есть несовместимый код — заранее очистите ветку `main` или примите merge вручную.

## 2. Клон и подготовка `.env`

```bash
git clone https://github.com/Drubersha/RentFlow.git
cd RentFlow
cp .env.example .env
```

Сгенерировать секреты:

```bash
# JWT_SECRET и ключи API одной командой
JWT_SECRET="$(openssl rand -base64 48)" node scripts/gen-keys.mjs
```

Скопировать вывод (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) в `.env`. Также проставить:

- `POSTGRES_PASSWORD` — любой надёжный пароль
- `SITE_URL` — публичный URL фронтенда, например `https://rentflow.example.com`
- `VITE_SUPABASE_URL` — публичный URL Supabase gateway, `https://api.example.com` (или `http://SERVER_IP:8000` без домена)
- `SUPABASE_URL` — внутренний адрес для server-функций: `http://kong:8000`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `SUPABASE_PUBLISHABLE_KEY` = `ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`

## 3. Запуск

```bash
docker compose up -d --build
docker compose logs -f app
```

Через ~30 сек:
- приложение: <http://SERVER_IP:3000>
- Supabase API: <http://SERVER_IP:8000>

## 4. Применение миграций

Миграции из `supabase/migrations/*.sql` применяются автоматически при **первом** старте Postgres (пустой том `db-data`). Если БД уже инициализирована, прогоните руками:

```bash
for f in supabase/migrations/*.sql; do
  docker compose exec -T db psql -U postgres -d postgres < "$f"
done
```

## 5. Создание storage bucket `documents`

```bash
docker compose exec -T db psql -U postgres -d postgres <<SQL
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
SQL
```

## 6. Создание первого пользователя

Через UI приложения (`/auth` → Регистрация) — `GOTRUE_MAILER_AUTOCONFIRM=true` в dev режиме сразу активирует аккаунт. Триггер `handle_new_user` назначит роль `owner` автоматически.

## 7. HTTPS через Caddy (опционально)

`Caddyfile`:

```
rentflow.example.com {
  reverse_proxy app:3000
}
api.example.com {
  reverse_proxy kong:8000
}
```

## Обновление

```bash
git pull
docker compose up -d --build app
```

## Бэкап БД

```bash
docker compose exec -T db pg_dump -U postgres postgres | gzip > backup-$(date +%F).sql.gz
```

## Что важно понимать

- **`VITE_*` переменные** инлайнятся в client bundle на этапе `docker compose build`. После изменения `VITE_SUPABASE_URL` нужно пересобирать `app`.
- **`SUPABASE_URL` (без `VITE_`)** читается server-функциями в рантайме — указывает на внутренний `http://kong:8000`.
- **Lovable Cloud и self-hosted Supabase несовместимы по данным** — это две разные БД. Чтобы перенести данные, экспортируйте через `pg_dump` из Cloud (Cloud → Database → Export) и `psql` в self-hosted.
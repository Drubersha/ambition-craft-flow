#!/bin/bash
# Пересоздание демо/тех-аккаунтов (*.rentflow.local) с нуля: УДАЛЯЕТ всех
# пользователей @rentflow.local и создаёт заново из DEMO_ACCOUNTS в .env:
#   DEMO_ACCOUNTS='email|пароль|Имя|роль;email2|...'  — роль пустая = обычный owner.
set -euo pipefail
cd "$(dirname "$0")/.."
# .env в формате docker-compose (бывают значения с <, пробелами) — целиком
# его source'ить нельзя, достаём только нужные переменные.
env_get() { sed -n "s/^$1=//p" ./.env | tail -1 | sed "s/^'//;s/'\$//"; }
SERVICE_ROLE_KEY=$(env_get SERVICE_ROLE_KEY)
DEMO_ACCOUNTS=$(env_get DEMO_ACCOUNTS)
if [ -z "$DEMO_ACCOUNTS" ]; then
  echo "DEMO_ACCOUNTS не задан в .env (формат: email|пароль|Имя|роль;...)" >&2
  exit 1
fi
BASE="http://127.0.0.1:8000/auth/v1/admin/users"
docker compose exec -T db psql -U postgres -d postgres \
  -c "delete from auth.users where lower(email) like '%@rentflow.local';" >/dev/null
IFS=';' read -ra ROWS <<< "$DEMO_ACCOUNTS"
for row in "${ROWS[@]}"; do
  IFS='|' read -r email pass name role <<< "$row"
  [ -z "$email" ] && continue
  resp=$(curl -s -X POST "$BASE" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\",\"signup_role\":\"owner\"}}")
  id=$(echo "$resp" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "$email -> id=$id"
  if [ -n "$role" ] && [ -n "$id" ]; then
    docker compose exec -T db psql -U postgres -d postgres \
      -c "insert into public.user_roles (user_id, role) values ('$id','$role'::public.app_role) on conflict do nothing;" >/dev/null
    echo "  + роль $role"
  fi
done

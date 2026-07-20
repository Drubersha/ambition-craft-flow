#!/bin/bash
# Сброс паролей демо/тех-аккаунтов (*.rentflow.local) на проде.
# Учётки берутся из .env (секреты в git не хранятся):
#   DEMO_ACCOUNTS='email|пароль|Имя|роль;email2|...'  — роль пустая = обычный owner.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
if [ -z "${DEMO_ACCOUNTS:-}" ]; then
  echo "DEMO_ACCOUNTS не задан в .env (формат: email|пароль|Имя|роль;...)" >&2
  exit 1
fi
IFS=';' read -ra ROWS <<< "$DEMO_ACCOUNTS"
for row in "${ROWS[@]}"; do
  IFS='|' read -r email pass name role <<< "$row"
  [ -z "$email" ] && continue
  uid=$(docker compose exec -T db psql -tA -U postgres -d postgres \
    -c "select id from auth.users where email='$email';" | tr -d '[:space:]')
  if [ -z "$uid" ]; then echo "$email: НЕ НАЙДЕН"; continue; fi
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:8000/auth/v1/admin/users/$uid" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"$pass\",\"email_confirm\":true}")
  echo "$email ($uid): HTTP $code"
done

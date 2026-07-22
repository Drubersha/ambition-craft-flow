#!/usr/bin/env bash
# ВНИМАНИЕ: боевой путь деплоя — .github/workflows/deploy.yml (по пушу в main).
# Этот скрипт — запасной/ручной вариант; не полагайся на него при обычном деплое.
#
# Update the production server to the latest `main` and rebuild the app.
#
# Manual run:   ./scripts/server-update.sh
# Scheduled:    via systemd timer at 00:01 daily (see scripts/leaseplease-update.timer)
#
# Safe by design:
#   - Only fast-forward pulls (`--ff-only`); if the local tree diverges or has
#     uncommitted changes the pull fails and nothing is rebuilt (no clobber).
#   - Does nothing when already up to date.
#   - A lock prevents overlapping runs.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG="${DEPLOY_LOG:-/var/log/leaseplease-deploy.log}"
LOCK="/tmp/leaseplease-deploy.lock"

cd "$REPO_DIR"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date '+%F %T') another update is already running; skipping" >>"$LOG"
  exit 0
fi

{
  echo "===== $(date '+%F %T') update start (branch=$BRANCH) ====="
  git fetch origin "$BRANCH"
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH")"
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Already up to date ($LOCAL); nothing to do."
    echo "===== $(date '+%F %T') update end ====="
    exit 0
  fi
  echo "Updating $LOCAL -> $REMOTE"
  git pull --ff-only origin "$BRANCH"
  # Прерванная пересборка оставляет контейнер под временным именем
  # (<hash>_leaseplease-app-1), и следующий запуск падает на конфликте имён.
  # container prune тут не помогает: он удаляет только остановленные, а такой
  # остаток обычно запущен. Убираем именно контейнеры с хэш-префиксом.
  docker ps -a --format '{{.Names}}' 2>/dev/null \
    | grep -E '^[0-9a-f]{12}_' \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker container prune -f >/dev/null 2>&1 || true
  # Сборка фронтенда и загруженная модель вместе не помещаются в память
  # сервера (~12 ГБ, модель занимает ~5): контейнеры создавались, но не
  # стартовали, и сайт отдавал 502. На время сборки освобождаем память.
  docker compose stop ollama >/dev/null 2>&1 || true
  docker compose up -d --build --remove-orphans
  docker compose start ollama >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  # Сборка могла не поднять контейнеры — проверяем и добиваем.
  sleep 5
  docker compose up -d >/dev/null 2>&1 || true
  echo "Now at $(git rev-parse --short HEAD)"
  echo "===== $(date '+%F %T') update end ====="
} >>"$LOG" 2>&1

#!/usr/bin/env bash
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
  # Убираем такие остатки до сборки, иначе деплой встаёт молча.
  docker container prune -f >/dev/null 2>&1 || true
  docker compose up -d --build --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
  echo "Now at $(git rev-parse --short HEAD)"
  echo "===== $(date '+%F %T') update end ====="
} >>"$LOG" 2>&1

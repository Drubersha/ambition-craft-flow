#!/usr/bin/env bash
# Restore LeasePlease DATA (Postgres + storage files) from a backup folder.
# Usage:
#   ./scripts/restore.sh /root/leaseplease-backups/daily/<timestamp>
#
# WARNING: this OVERWRITES the current database and storage files with the backup.
set -euo pipefail

SRC="${1:?Usage: restore.sh <backup-folder>}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
PROJECT="${COMPOSE_PROJECT_NAME:-leaseplease}"

[ -f "$SRC/db.sql.gz" ] || { echo "No db.sql.gz in $SRC"; exit 1; }

echo "About to RESTORE from: $SRC"
echo "This OVERWRITES current database and storage. Make sure you have a fresh backup first."
read -r -p "Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }

echo "[restore] database…"
gunzip -c "$SRC/db.sql.gz" | docker compose exec -T db psql -U postgres -d postgres

if [ -f "$SRC/storage.tar.gz" ]; then
  echo "[restore] storage files…"
  docker run --rm \
    -v "${PROJECT}_storage-data:/data" \
    -v "$SRC:/backup:ro" \
    alpine sh -c "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/storage.tar.gz -C /data"
fi

echo "[restore] restarting app services…"
docker compose restart app storage rest auth kong 2>/dev/null || docker compose restart
echo "[restore] done."

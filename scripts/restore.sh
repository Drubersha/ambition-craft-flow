#!/usr/bin/env bash
# Restore LeasePlease DATA (Postgres + storage files) from a backup folder.
# Usage:
#   ./scripts/restore.sh /root/leaseplease-backups/daily/<timestamp>
#
# WARNING: this STOPS the app services, OVERWRITES the current database and storage
# with the backup, then brings the stack back up. Downtime is expected during restore
# (required for a consistent restore — no live connections while the DB/schema is replaced).
set -euo pipefail

SRC="${1:?Usage: restore.sh <backup-folder>}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
PROJECT="${COMPOSE_PROJECT_NAME:-leaseplease}"

[ -f "$SRC/db.sql.gz" ] || { echo "No db.sql.gz in $SRC"; exit 1; }

echo "About to RESTORE from: $SRC"
echo "This STOPS app services, OVERWRITES the database and storage, then restarts them."
read -r -p "Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }

# Stop everything that holds DB/storage connections so the restore is consistent.
# Keep only 'db' running (psql needs it); realtime/kong may be absent -> ignore errors.
echo "[restore] stopping app services…"
docker compose stop app auth rest storage kong realtime 2>/dev/null || true
docker compose up -d db

echo "[restore] waiting for database…"
for _ in $(seq 1 30); do
  docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

# ON_ERROR_STOP=1 makes a partial/failed restore abort loudly instead of silently continuing.
echo "[restore] database…"
gunzip -c "$SRC/db.sql.gz" | docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1

if [ -f "$SRC/storage.tar.gz" ]; then
  echo "[restore] storage files…"
  # 'find -delete' clears contents (incl. hidden) with a real exit code; '&&' so a
  # failed wipe aborts before extracting instead of masking the error.
  docker run --rm \
    -v "${PROJECT}_storage-data:/data" \
    -v "$SRC:/backup:ro" \
    alpine sh -c "find /data -mindepth 1 -delete && tar xzf /backup/storage.tar.gz -C /data"
fi

echo "[restore] starting all services…"
docker compose up -d
echo "[restore] done."

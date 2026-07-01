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

# Always try to bring the stack back up, even if the restore fails part-way,
# so a failed restore never leaves production down.
bring_up() {
  echo "[restore] ensuring services are up…"
  docker compose up -d || true
}
trap bring_up EXIT

# Stop everything that holds DB/storage connections (each individually, so a
# service that isn't defined here — e.g. realtime lives in an override — can't
# abort the whole stop). Keep only 'db' running for psql.
for svc in app auth rest storage kong realtime caddy; do
  docker compose stop "$svc" 2>/dev/null || true
done
docker compose up -d db

echo "[restore] waiting for database…"
db_ready=""
for _ in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 2
done
if [ -z "$db_ready" ]; then
  echo "[restore] ERROR: database did not become ready — aborting" >&2
  exit 1
fi

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
trap - EXIT
echo "[restore] done."

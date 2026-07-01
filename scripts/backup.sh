#!/usr/bin/env bash
# Back up LeasePlease DATA before changes: Postgres (all schemas) + storage files + .env.
# Code itself is versioned in git, so this focuses on data that can't be recovered otherwise.
#
# Usage:
#   ./scripts/backup.sh <label>          # label groups/rotates backups, e.g. "daily" or "predeploy"
#
# Retention: keeps the newest BACKUP_KEEP backups PER LABEL (default 2). So with the
# daily timer + pre-deploy hook you always have: yesterday's copy AND the copy taken
# right before the latest change.
#
# NOTE: this is a HOT logical backup (no downtime). The DB dump and the storage archive
# are taken back-to-back, so a write in the gap could differ by a few seconds between
# db.sql.gz and storage.tar.gz. That is an accepted trade-off to avoid daily downtime.
set -euo pipefail

LABEL="${1:-manual}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

BACKUP_ROOT="${BACKUP_ROOT:-/root/leaseplease-backups}"
KEEP="${BACKUP_KEEP:-2}"
PROJECT="${COMPOSE_PROJECT_NAME:-leaseplease}"

# Single-run lock so overlapping runs (daily timer + pre-deploy hook, ~1 min apart)
# never rotate/prune each other's in-progress directories. Wait up to 10 min.
mkdir -p "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.backup.lock"
if ! flock -w 600 9; then
  # Fail (non-zero) rather than skip silently: callers (deploy.yml / reset-data.sh)
  # use `set -e` and must NOT proceed thinking a fresh backup exists.
  echo "[backup] ERROR: could not acquire lock within timeout" >&2
  exit 1
fi

TS="$(date '+%Y%m%d-%H%M%S')"
DEST="$BACKUP_ROOT/$LABEL/$TS"
mkdir -p "$DEST"

# Remove a half-written backup if any step fails, so rotation never keeps a partial snapshot.
cleanup_partial() {
  echo "[backup] FAILED — removing partial backup $DEST" >&2
  rm -rf "$DEST"
}
trap cleanup_partial ERR

echo "[backup] label=$LABEL dest=$DEST"

# 1) Postgres logical dump — includes public, auth and storage schemas (all user data).
docker compose exec -T db pg_dump -U postgres -d postgres --clean --if-exists \
  | gzip > "$DEST/db.sql.gz"

# 2) Uploaded files (chat photos, documents) from the storage volume.
docker run --rm \
  -v "${PROJECT}_storage-data:/data:ro" \
  -v "$DEST:/backup" \
  alpine sh -c "tar czf /backup/storage.tar.gz -C /data ."

# 3) Config needed to restore (secrets — kept locally with strict perms, never in git).
[ -f .env ] && cp .env "$DEST/env.backup" || true

# 4) Note the deployed code version for reference.
git rev-parse HEAD > "$DEST/code-commit.txt" 2>/dev/null || true

chmod -R go-rwx "$DEST" 2>/dev/null || true

# Backup content is complete — from here a failure must NOT delete this good snapshot.
trap - ERR

# 5) Rotation — keep only the newest $KEEP backups for this label.
if [ -d "$BACKUP_ROOT/$LABEL" ]; then
  ls -1dt "$BACKUP_ROOT/$LABEL"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "[backup] pruning old: $old"
    rm -rf "$old"
  done
fi

echo "[backup] done: $(du -sh "$DEST" | cut -f1) at $DEST"

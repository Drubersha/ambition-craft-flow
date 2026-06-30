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
set -euo pipefail

LABEL="${1:-manual}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

BACKUP_ROOT="${BACKUP_ROOT:-/root/leaseplease-backups}"
KEEP="${BACKUP_KEEP:-2}"
PROJECT="${COMPOSE_PROJECT_NAME:-leaseplease}"
TS="$(date '+%Y%m%d-%H%M%S')"
DEST="$BACKUP_ROOT/$LABEL/$TS"
mkdir -p "$DEST"

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

# 5) Rotation — keep only the newest $KEEP backups for this label.
if [ -d "$BACKUP_ROOT/$LABEL" ]; then
  ls -1dt "$BACKUP_ROOT/$LABEL"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "[backup] pruning old: $old"
    rm -rf "$old"
  done
fi

echo "[backup] done: $(du -sh "$DEST" | cut -f1) at $DEST"

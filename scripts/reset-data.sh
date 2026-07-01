#!/usr/bin/env bash
# DESTRUCTIVE: wipe all business data for a clean field-test launch, keeping ONLY
# the listed technical accounts. Makes a backup first, then truncates all domain
# tables, deletes every other auth user, and clears uploaded storage files.
#
# Usage:
#   KEEP_EMAILS="admin@rentflow.local,moderator@rentflow.local" ./scripts/reset-data.sh
# or edit the default KEEP_EMAILS below.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
PROJECT="${COMPOSE_PROJECT_NAME:-leaseplease}"

# Technical accounts to KEEP (comma-separated, lowercase emails).
KEEP_EMAILS="${KEEP_EMAILS:-admin@rentflow.local,moderator@rentflow.local,demo@rentflow.local,demo2@rentflow.local}"

echo "This will DELETE ALL business data and ALL users EXCEPT:"
echo "  $KEEP_EMAILS"
if [ "${FORCE:-0}" != "1" ]; then
  read -r -p "Type RESET to continue: " c
  [ "$c" = "RESET" ] || { echo "Aborted."; exit 1; }
fi

echo "[reset] backup first…"
bash scripts/backup.sh prereset

# Turn the CSV into a quoted SQL list: 'a@x','b@y'
# Any single quote inside an email is doubled ('' ) so it can't break out of the
# string literal or inject SQL.
KEEP_SQL=""
IFS=',' read -ra _emails <<< "$KEEP_EMAILS"
for e in "${_emails[@]}"; do
  e="$(printf '%s' "$e" | tr '[:upper:]' '[:lower:]')"
  # trim surrounding whitespace without a subshell/xargs (xargs mishandles quotes)
  e="${e#"${e%%[![:space:]]*}"}"
  e="${e%"${e##*[![:space:]]}"}"
  # double single quotes so the value can't break out of the SQL string literal
  e="${e//\'/\'\'}"
  [ -n "$e" ] && KEEP_SQL="${KEEP_SQL}'${e}',"
done
KEEP_SQL="${KEEP_SQL%,}"
[ -n "$KEEP_SQL" ] || { echo "KEEP_EMAILS is empty — refusing to delete everyone."; exit 1; }

echo "[reset] wiping domain tables + non-technical users…"
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
BEGIN;
TRUNCATE
  public.activity_logs, public.budget_expenses, public.budget_categories, public.budget_plans,
  public.charge_items, public.charges, public.payments, public.contracts,
  public.chat_attachments, public.chat_messages, public.chat_threads,
  public.task_suggestions, public.tasks, public.lead_events, public.leads,
  public.documents, public.folders, public.property_markings, public.tenants,
  public.properties, public.notifications, public.user_links
  RESTART IDENTITY CASCADE;

-- Remove uploaded-file records, keep the buckets themselves.
DELETE FROM storage.objects;

-- Delete every account except the technical ones (cascades their profiles/roles).
DELETE FROM auth.users WHERE email IS NULL OR lower(email) NOT IN (${KEEP_SQL});
COMMIT;
SQL

echo "[reset] clearing uploaded files on disk…"
# 'find -delete' removes all contents (incl. hidden) and returns a real exit code, so a
# failed wipe aborts (set -e) instead of being masked — no DB/files mismatch on success.
docker run --rm -v "${PROJECT}_storage-data:/data" alpine sh -c 'find /data -mindepth 1 -delete'

echo "[reset] done. Remaining accounts:"
docker compose exec -T db psql -U postgres -d postgres -c "SELECT u.email, array_agg(r.role) AS roles FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id=u.id GROUP BY u.email ORDER BY u.email;"

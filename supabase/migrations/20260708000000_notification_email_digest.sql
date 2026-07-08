-- Email digests instead of per-notification emails.
--
-- Mass data entry (many tenants/properties/contracts at once) used to produce
-- an email per notification. Delivery is now scheduled by the app:
--   - kind='account' (security) — sent immediately by the app itself;
--   - kind='chat' — digest every 30 minutes;
--   - everything else — digest every 2 hours.
-- The app scheduler picks rows where emailed_at IS NULL, sends one digest per
-- user and stamps emailed_at, so the per-insert pg_net webhook is obsolete.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

-- Historical rows were already delivered by the old per-insert pipeline (or
-- predate email entirely) — never re-send them.
UPDATE public.notifications SET emailed_at = created_at WHERE emailed_at IS NULL;

-- The scheduler polls for pending rows; keep that scan cheap.
CREATE INDEX IF NOT EXISTS idx_notifications_pending_email
  ON public.notifications (created_at)
  WHERE emailed_at IS NULL;

-- Stop emailing on every insert.
DROP TRIGGER IF EXISTS notification_email ON public.notifications;
DROP FUNCTION IF EXISTS public.trg_notification_email();

-- PostgREST must see the new column immediately, otherwise the scheduler's
-- emailed_at updates are rejected by a stale schema cache.
NOTIFY pgrst, 'reload schema';

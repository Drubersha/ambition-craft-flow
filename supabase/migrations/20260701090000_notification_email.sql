-- Email delivery for in-app notifications.
--
-- Every row inserted into public.notifications is delivered to the recipient's
-- account email. Delivery is done out-of-band via pg_net: an AFTER INSERT trigger
-- POSTs the notification id to the app webhook (/api/notify-email), which resolves
-- the recipient email and sends it through UniSender Go (src/lib/email.server.ts).
--
-- This keeps a single source of truth for email (the app) and covers every current
-- and future notification kind automatically (tasks, chats, contracts, charges, …).

-- 1. pg_net (async HTTP from Postgres). Bundled in the supabase/postgres image.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Runtime config for the webhook (single row). Not exposed to clients:
--    RLS on + no grants to anon/authenticated => only service_role / trigger (definer) read it.
CREATE TABLE IF NOT EXISTS public.email_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  webhook_url text NOT NULL,
  webhook_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_settings TO service_role;

-- 3. Notify recipient by email whenever a notification row is created.
CREATE OR REPLACE FUNCTION public.trg_notification_email()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.email_settings;
BEGIN
  SELECT * INTO s FROM public.email_settings WHERE id LIMIT 1;
  IF NOT FOUND OR NOT s.enabled OR COALESCE(s.webhook_url, '') = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := s.webhook_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', s.webhook_secret
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let email delivery break the originating write.
    RAISE WARNING 'notification email enqueue failed: %', SQLERRM;
  END;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_notification_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notification_email ON public.notifications;
CREATE TRIGGER notification_email AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_email();

-- 4. Tasks were not surfaced as notifications; add one so accepted tasks also
--    reach owner + linked managers (and therefore email).
CREATE OR REPLACE FUNCTION public.trg_notify_task_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._notify_owner_and_managers(
    NEW.owner_id, 'task', 'Новая задача', COALESCE(NEW.title, ''),
    'tasks', NEW.id, '/tasks'
  );
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_notify_task_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_task_insert ON public.tasks;
CREATE TRIGGER notify_task_insert AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_insert();

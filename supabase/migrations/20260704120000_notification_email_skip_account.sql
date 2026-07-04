-- Account/security notifications (kind='account', e.g. password changed) get a
-- dedicated, fully-worded security email from the app itself. Skip them in the
-- generic notification->email pipeline so the user isn't emailed twice.
CREATE OR REPLACE FUNCTION public.trg_notification_email()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.email_settings;
BEGIN
  IF NEW.kind = 'account' THEN
    RETURN NEW;
  END IF;

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


-- Enums
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('accepted','in_progress','review','done','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','normal','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_suggestion_status AS ENUM ('pending','accepted','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'accepted',
  priority public.task_priority NOT NULL DEFAULT 'normal',
  photo_paths text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks demo all" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX tasks_status_idx ON public.tasks(status);
CREATE INDEX tasks_tenant_idx ON public.tasks(tenant_id);

-- Suggestions
CREATE TABLE public.task_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority public.task_priority NOT NULL DEFAULT 'normal',
  photo_paths text[] NOT NULL DEFAULT '{}',
  status public.task_suggestion_status NOT NULL DEFAULT 'pending',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_suggestions TO authenticated;
GRANT ALL ON public.task_suggestions TO service_role;
ALTER TABLE public.task_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_suggestions demo all" ON public.task_suggestions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX task_suggestions_status_idx ON public.task_suggestions(status);

-- Mark analyzed messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_suggestions;

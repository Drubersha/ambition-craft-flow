-- История переписки с ИИ-помощником: чат должен переживать перезагрузку
-- страницы и смену устройства.
--
-- Переписка личная: привязана к пользователю, который спрашивал (user_id), и
-- к владельцу данных (owner_id) — менеджер, работающий с чужим кабинетом,
-- видит только свои вопросы, а не вопросы владельца.
--
-- Ссылки на источники храним как есть (jsonb): их строит сервер при ответе,
-- и после перезагрузки они должны остаться кликабельными.

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  body text NOT NULL,
  -- Только у ответов помощника: ссылки на записи, факты и выбранный инструмент.
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts text,
  tool text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_user ON public.ai_messages(user_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Своя переписка — только своя, независимо от прав на данные владельца.
CREATE POLICY "own ai_messages" ON public.ai_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

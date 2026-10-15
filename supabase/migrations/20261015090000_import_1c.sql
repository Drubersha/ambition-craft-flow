-- Приёмник данных из 1С (POST /api/1c/import). Спецификация формата 1.0 — docs/1c/.
--
-- Идея: 1С раз в сутки присылает JSON со справочниками целиком и документами за
-- полгода. Ключ сопоставления — GUID объекта 1С (external_id), поэтому повторная
-- загрузка обновляет, а не дублирует. Каждый пакет и каждое изменение пишутся в
-- историю: правки задним числом в 1С видны по датам, аннулированные документы
-- сохраняются снимком перед удалением из рабочих таблиц.
--
-- Все новые колонки необязательные — записи, заведённые руками, не затрагиваются.
-- После применения на бою: NOTIFY pgrst, 'reload schema'.

-- ── Внешние ключи 1С ────────────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS external_id text,
  -- Иностранный арендатор: ИНН нет, вместо него налоговый/регистрационный
  -- номер своей страны (BIN, TIN). country — ISO 3166-1 alpha-2.
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'RU',
  ADD COLUMN IF NOT EXISTS foreign_tax_id text;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_owner_external_id_uidx
  ON public.tenants (owner_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS properties_owner_external_id_uidx
  ON public.properties (owner_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS external_id text,
  -- Дата подписания (start_date — начало аренды, у допсоглашения — дата вступления в силу).
  ADD COLUMN IF NOT EXISTS signed_date date;
CREATE UNIQUE INDEX IF NOT EXISTS contracts_owner_external_id_uidx
  ON public.contracts (owner_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS external_id text,
  -- Документ реализации в 1С: номер, дата, вид (rent | utilities | other) и
  -- разбивка суммы на «без НДС» и НДС (total остаётся суммой с НДС).
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS doc_date date,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS amount_without_vat numeric(14, 2),
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14, 2);
CREATE UNIQUE INDEX IF NOT EXISTS charges_owner_external_id_uidx
  ON public.charges (owner_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS external_id text,
  -- Один платёж 1С может закрывать несколько начислений: тогда у нас несколько
  -- строк с одним external_id и разным allocation_index.
  ADD COLUMN IF NOT EXISTS allocation_index smallint NOT NULL DEFAULT 0,
  -- bank_in | cash_in | offset | return | adjustment (у ручных платежей NULL).
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS doc_number text,
  -- Взаимозачёт: акт зачёта, встречный документ, чем оплачено, статья расходов.
  ADD COLUMN IF NOT EXISTS offset_info jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS payments_owner_external_id_uidx
  ON public.payments (owner_id, external_id, allocation_index) WHERE external_id IS NOT NULL;

-- ── Токены приёмника ────────────────────────────────────────────────────────
-- Хранится только SHA-256 токена; сам токен показывается владельцу один раз.
CREATE TABLE IF NOT EXISTS public.import_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  allowed_ips text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- ── Пакеты импорта ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.import_tokens (id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  dry_run boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'window',
  period_from date,
  period_to date,
  source jsonb,
  file_hash text,
  file_size integer,
  -- ok — принят; rejected — не прошёл проверку (ничего не записано);
  -- failed — упал в процессе записи (повторная отправка того же файла безопасна).
  status text NOT NULL,
  report jsonb,
  error text,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS import_batches_owner_received_idx
  ON public.import_batches (owner_id, received_at DESC);

-- ── История изменений по импорту ────────────────────────────────────────────
-- Одна строка на изменённую запись: что было и что стало (только изменённые
-- поля), а при аннулировании — полный снимок удалённой строки.
CREATE TABLE IF NOT EXISTS public.import_history (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.import_batches (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_id uuid,
  external_id text,
  -- create | update | link (ручная запись привязана к GUID) | void (аннулирована)
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_history_owner_table_ext_idx
  ON public.import_history (owner_id, table_name, external_id);
CREATE INDEX IF NOT EXISTS import_history_batch_idx ON public.import_history (batch_id);

-- ── RLS: владелец читает свои пакеты, историю и токены; пишет только приёмник ──
ALTER TABLE public.import_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own import_tokens" ON public.import_tokens;
CREATE POLICY "own import_tokens" ON public.import_tokens
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "own import_batches" ON public.import_batches;
CREATE POLICY "own import_batches" ON public.import_batches
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "own import_history" ON public.import_history;
CREATE POLICY "own import_history" ON public.import_history
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Гранты: без них PostgREST отдаёт 403 (см. contract_properties, 23.07.2026).
GRANT SELECT ON public.import_tokens, public.import_batches, public.import_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.import_tokens, public.import_batches, public.import_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.import_history_id_seq TO service_role;

-- ── Пересчёт пачки начислений после импорта платежей ────────────────────────
-- Триггер на payments пересчитывает paid_total сам; эта функция нужна для
-- начислений, у которых платежей не было (статус overdue по сроку).
CREATE OR REPLACE FUNCTION public.recalc_charges(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY _ids LOOP
    PERFORM public.recalc_charge(v_id);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.recalc_charges(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_charges(uuid[]) TO service_role;

-- Коммунальные услуги: счётчики, показания, распределение затрат по арендаторам.
--
-- Модель:
--  * meters — реестр счётчиков. Счётчик стоит либо в помещении (property_id,
--    опционально привязан к договору арендатора через contract_id), либо общий
--    у арендодателя на группу объектов (folder_id). start_value — начальное
--    показание (счётчик может быть б/у, поэтому не обязательно 0).
--  * meter_readings — показания. Арендатор может вносить показания по
--    счётчикам своего арендодателя (source='tenant'), владелец/менеджер — любые.
--  * utility_periods — закрытый период по папке и услуге: общий счёт за
--    коммуналку, связь с расходом бюджета (budget_expenses).
--  * utility_allocations — результат распределения периода по договорам:
--    по показаниям (by_meter) и/или пропорционально площади (by_area);
--    ссылка на созданную позицию начисления (charge_items kind='utilities').

-- ===== ENUMS =====
CREATE TYPE public.meter_type AS ENUM ('electricity', 'water_cold', 'water_hot', 'gas', 'heat');
CREATE TYPE public.meter_reading_source AS ENUM ('tenant', 'owner');
CREATE TYPE public.utility_period_status AS ENUM ('draft', 'allocated');

-- ===== METERS =====
CREATE TABLE public.meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serial_no text NOT NULL,
  type public.meter_type NOT NULL DEFAULT 'electricity',
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  start_value numeric(14,3) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Счётчик стоит ровно в одном месте: помещение ИЛИ группа объектов.
  CONSTRAINT meters_scope CHECK (((property_id IS NOT NULL)::int + (folder_id IS NOT NULL)::int) = 1),
  -- К договору можно привязать только счётчик помещения.
  CONSTRAINT meters_contract_scope CHECK (contract_id IS NULL OR property_id IS NOT NULL),
  CONSTRAINT meters_start_value_nonneg CHECK (start_value >= 0)
);
CREATE INDEX idx_meters_owner ON public.meters(owner_id);
CREATE INDEX idx_meters_property ON public.meters(property_id);
CREATE INDEX idx_meters_folder ON public.meters(folder_id);
CREATE INDEX idx_meters_contract ON public.meters(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meters TO authenticated;
GRANT ALL ON public.meters TO service_role;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meters owner full" ON public.meters FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "meters linked manager" ON public.meters FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "meters linked tenant" ON public.meters FOR SELECT TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

CREATE TRIGGER trg_meters_updated BEFORE UPDATE ON public.meters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== METER READINGS =====
CREATE TABLE public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  reading numeric(14,3) NOT NULL,
  read_at date NOT NULL DEFAULT CURRENT_DATE,
  source public.meter_reading_source NOT NULL DEFAULT 'owner',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meter_readings_nonneg CHECK (reading >= 0)
);
CREATE INDEX idx_meter_readings_meter_date ON public.meter_readings(meter_id, read_at);
CREATE INDEX idx_meter_readings_owner ON public.meter_readings(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_readings TO authenticated;
GRANT ALL ON public.meter_readings TO service_role;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meter_readings owner full" ON public.meter_readings FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "meter_readings linked manager" ON public.meter_readings FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
CREATE POLICY "meter_readings linked tenant select" ON public.meter_readings FOR SELECT TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));
-- Арендатор подаёт показания только от своего имени и только по счётчикам
-- своего арендодателя (owner_id обязан совпадать с владельцем счётчика).
CREATE POLICY "meter_readings linked tenant insert" ON public.meter_readings FOR INSERT TO authenticated
  WITH CHECK (
    source = 'tenant'::public.meter_reading_source
    AND public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role)
    AND owner_id = (SELECT m.owner_id FROM public.meters m WHERE m.id = meter_id)
  );

-- ===== UTILITY PERIODS =====
CREATE TABLE public.utility_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  service public.meter_type NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  expense_id uuid REFERENCES public.budget_expenses(id) ON DELETE SET NULL,
  status public.utility_period_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_periods_range CHECK (period_end >= period_start),
  CONSTRAINT utility_periods_total_nonneg CHECK (total_amount >= 0)
);
CREATE INDEX idx_utility_periods_owner ON public.utility_periods(owner_id);
CREATE INDEX idx_utility_periods_folder ON public.utility_periods(folder_id, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utility_periods TO authenticated;
GRANT ALL ON public.utility_periods TO service_role;
ALTER TABLE public.utility_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utility_periods owner full" ON public.utility_periods FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "utility_periods linked manager" ON public.utility_periods FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));

CREATE TRIGGER trg_utility_periods_updated BEFORE UPDATE ON public.utility_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== UTILITY ALLOCATIONS =====
CREATE TABLE public.utility_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.utility_periods(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  charge_id uuid REFERENCES public.charges(id) ON DELETE SET NULL,
  consumption numeric(14,3),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'by_meter',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_allocations_method CHECK (method IN ('by_meter', 'by_area', 'mixed')),
  CONSTRAINT utility_allocations_amount_nonneg CHECK (amount >= 0)
);
CREATE INDEX idx_utility_allocations_period ON public.utility_allocations(period_id);
CREATE INDEX idx_utility_allocations_contract ON public.utility_allocations(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utility_allocations TO authenticated;
GRANT ALL ON public.utility_allocations TO service_role;
ALTER TABLE public.utility_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utility_allocations owner full" ON public.utility_allocations FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "utility_allocations linked manager" ON public.utility_allocations FOR ALL TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_linked_member(owner_id, auth.uid(), 'manager'::public.app_role));
-- Арендатор видит свои строки распределения (детализация начисления).
CREATE POLICY "utility_allocations linked tenant" ON public.utility_allocations FOR SELECT TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::public.app_role));

-- ===== ALERT: аномальный расход с учётом сезонности =====
-- После каждого показания сравниваем средний суточный расход текущего
-- интервала с базой: тот же сезон год назад (окно ±45 дней), а если данных
-- меньше года — средний расход за ~90 дней до предыдущего показания.
-- Отклонение ≥ 30% — уведомление владельцу и менеджерам.
CREATE OR REPLACE FUNCTION public.trg_meter_reading_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meter public.meters%ROWTYPE;
  v_prev public.meter_readings%ROWTYPE;
  v_days integer;
  v_cur_daily numeric;
  v_base_daily numeric;
  v_pct numeric;
BEGIN
  SELECT * INTO v_meter FROM public.meters WHERE id = NEW.meter_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_prev FROM public.meter_readings
  WHERE meter_id = NEW.meter_id AND id <> NEW.id AND read_at <= NEW.read_at
  ORDER BY read_at DESC, created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_days := NEW.read_at - v_prev.read_at;
  IF v_days <= 0 OR NEW.reading < v_prev.reading THEN RETURN NEW; END IF;
  v_cur_daily := (NEW.reading - v_prev.reading) / v_days;

  -- Сезонная база: суточный расход в окне вокруг той же даты год назад.
  SELECT (MAX(reading) - MIN(reading)) / GREATEST(1, MAX(read_at) - MIN(read_at))
  INTO v_base_daily
  FROM public.meter_readings
  WHERE meter_id = NEW.meter_id
    AND read_at BETWEEN (NEW.read_at - INTERVAL '1 year 45 days')::date
                    AND (NEW.read_at - INTERVAL '1 year' + INTERVAL '45 days')::date
  HAVING COUNT(*) >= 2 AND MAX(read_at) > MIN(read_at);

  -- Фолбэк: средний расход за ~3 предыдущих месяца.
  IF v_base_daily IS NULL OR v_base_daily <= 0 THEN
    SELECT (v_prev.reading - MIN(reading)) / GREATEST(1, v_prev.read_at - MIN(read_at))
    INTO v_base_daily
    FROM public.meter_readings
    WHERE meter_id = NEW.meter_id
      AND id <> NEW.id
      AND read_at BETWEEN v_prev.read_at - 90 AND v_prev.read_at
    HAVING COUNT(*) >= 2 AND MIN(read_at) < v_prev.read_at;
  END IF;

  IF v_base_daily IS NULL OR v_base_daily <= 0 THEN RETURN NEW; END IF;

  v_pct := ABS(v_cur_daily - v_base_daily) / v_base_daily;
  IF v_pct >= 0.30 THEN
    PERFORM public._notify_owner_and_managers(
      v_meter.owner_id,
      'utility_alert',
      'Аномальный расход по счётчику',
      'Счётчик ' || v_meter.serial_no || ': ' || ROUND(v_cur_daily, 2) || '/сут при обычных '
        || ROUND(v_base_daily, 2) || '/сут ('
        || CASE WHEN v_cur_daily >= v_base_daily THEN '+' ELSE '-' END
        || ROUND(v_pct * 100) || '%). Проверьте показания.',
      'meters',
      v_meter.id,
      '/utilities'
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER meter_reading_alert AFTER INSERT ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.trg_meter_reading_alert();

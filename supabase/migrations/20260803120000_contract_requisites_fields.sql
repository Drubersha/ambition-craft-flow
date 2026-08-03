-- Поля, которых не хватало для полного переноса бумажного договора в программу.
-- Разобран реальный договор (ЭВ/2024/0624, ДАРХАС): выяснилось, что расчёт денег
-- и долга опирался на данные, которых в базе просто нет — НДС, день и порядок
-- оплаты, пени. Плюс не было реквизитов сторон, без которых нельзя выставить счёт.
-- Все колонки необязательные: существующие договоры продолжают работать как есть.

-- ── Договоры ───────────────────────────────────────────────────────────────
ALTER TABLE public.contracts
  -- НДС. vat_included=true — «в том числе НДС» (сумма договора уже с налогом),
  -- false — «сверх». Без этого выручка без НДС считалась вручную.
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2),
  ADD COLUMN IF NOT EXISTS vat_included boolean NOT NULL DEFAULT true,

  -- Порядок оплаты фиксированной части. payment_timing:
  --   'advance'  — до N числа месяца, ПРЕДШЕСТВУЮЩЕГО расчётному (предоплата),
  --   'arrears'  — до N числа месяца, СЛЕДУЮЩЕГО за расчётным (постоплата),
  --   'current'  — до N числа расчётного месяца.
  -- От этого зависит срок платежа, а значит и попадание в просрочку.
  ADD COLUMN IF NOT EXISTS payment_day smallint,
  ADD COLUMN IF NOT EXISTS payment_timing text,

  -- Переменная часть (возмещение коммуналки) — оплачивается отдельно и обычно
  -- в другой срок, чем фиксированная.
  ADD COLUMN IF NOT EXISTS has_variable_part boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variable_payment_day smallint,
  ADD COLUMN IF NOT EXISTS variable_part_note text,

  -- Санкции: пени за день просрочки и штраф за нецелевое использование.
  ADD COLUMN IF NOT EXISTS penalty_percent_per_day numeric(6, 4),
  ADD COLUMN IF NOT EXISTS misuse_penalty_percent numeric(5, 2),

  -- Срок: договор часто считается от акта приёма-передачи, а не от даты
  -- договора, и продлевается сам — без этого он выглядит истёкшим.
  ADD COLUMN IF NOT EXISTS handover_date date,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renew_months smallint,
  ADD COLUMN IF NOT EXISTS termination_notice_days smallint,

  -- Обеспечительный платёж: сумма уже была, не было факта внесения.
  ADD COLUMN IF NOT EXISTS deposit_paid_at date,

  -- Основание права собственности арендодателя и подсудность — нужны в
  -- претензии и в шапке документов.
  ADD COLUMN IF NOT EXISTS ownership_basis text,
  ADD COLUMN IF NOT EXISTS jurisdiction text;

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_payment_timing_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_payment_timing_check
  CHECK (payment_timing IS NULL OR payment_timing IN ('advance', 'arrears', 'current'));

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_payment_day_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_payment_day_check
  CHECK (
    (payment_day IS NULL OR payment_day BETWEEN 1 AND 31)
    AND (variable_payment_day IS NULL OR variable_payment_day BETWEEN 1 AND 31)
  );

-- ── Арендаторы: реквизиты для счетов и актов ────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kpp text,
  ADD COLUMN IF NOT EXISTS ogrn text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS actual_address text,
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_bik text,
  ADD COLUMN IF NOT EXISTS bank_corr_account text,
  -- Кто подписывает и на каком основании — «Генеральный директор Хасбиев Д.Ш.,
  -- на основании устава».
  ADD COLUMN IF NOT EXISTS signatory_name text,
  ADD COLUMN IF NOT EXISTS signatory_position text,
  ADD COLUMN IF NOT EXISTS signatory_basis text;

-- ── Арендодатель: своих реквизитов не хранилось нигде ───────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS inn text,
  ADD COLUMN IF NOT EXISTS ogrn text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_bik text,
  ADD COLUMN IF NOT EXISTS bank_corr_account text,
  -- «Свидетельство о госрегистрации ИП серия 16 №005242334 от 11.04.2008».
  ADD COLUMN IF NOT EXISTS registration_basis text;

COMMENT ON COLUMN public.contracts.vat_included IS 'true — сумма договора уже включает НДС, false — НДС начисляется сверх';
COMMENT ON COLUMN public.contracts.payment_timing IS 'advance — предоплата (месяц до расчётного), arrears — постоплата, current — в расчётном месяце';
COMMENT ON COLUMN public.contracts.penalty_percent_per_day IS 'Пени в % от долга за каждый день просрочки, напр. 0.1';

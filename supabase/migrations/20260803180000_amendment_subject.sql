-- Предмет дополнительного соглашения: чем оно меняет договор.
-- Изменения ставки, площади и сроков видны сравнением полей, но допсоглашение
-- часто меняет и то, чего в полях нет, — например реквизиты стороны. Такие
-- изменения фиксируются текстом, иначе документ выглядит пустым.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS amendment_subject text;

COMMENT ON COLUMN public.contracts.amendment_subject IS
  'Для допсоглашений (parent_contract_id IS NOT NULL): что меняет документ';

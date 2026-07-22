-- Единицы измерения и составные договоры.

-- 1. Чем сдаётся объект/договор: квадратные метры, машиноместа или лоты.
--    У машиномест в «площади» хранится число мест — единица делает это явным,
--    а предупреждение об обязательных счётчиках показывается только там, где
--    счётчики бывают (помещения в м²).
CREATE TYPE lease_unit AS ENUM ('sqm', 'space', 'lot');
ALTER TABLE public.properties ADD COLUMN unit lease_unit NOT NULL DEFAULT 'sqm';
ALTER TABLE public.contracts ADD COLUMN unit lease_unit NOT NULL DEFAULT 'sqm';

-- 2. Допсоглашения: дочерний договор ссылается на основной.
ALTER TABLE public.contracts
  ADD COLUMN parent_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
CREATE INDEX idx_contracts_parent ON public.contracts(parent_contract_id)
  WHERE parent_contract_id IS NOT NULL;

-- 3. Один договор — несколько объектов (комнаты офиса и т.п.).
--    contracts.property_id остаётся основным объектом; строки здесь описывают
--    полный состав договора с площадью каждой части.
CREATE TABLE public.contract_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  area numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, property_id)
);
CREATE INDEX idx_contract_properties_contract ON public.contract_properties(contract_id);
CREATE INDEX idx_contract_properties_property ON public.contract_properties(property_id);

ALTER TABLE public.contract_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner and managers manage contract properties" ON public.contract_properties
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_linked_member(owner_id, auth.uid(), 'manager'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.is_linked_member(owner_id, auth.uid(), 'manager'::app_role));
CREATE POLICY "linked tenants view contract properties" ON public.contract_properties
  FOR SELECT TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::app_role));

-- Забытые табличные гранты на contract_properties: RLS-политики есть, но без
-- GRANT ролям API PostgREST возвращал 403 (42501), и дашборд, который читает
-- эту таблицу, висел на бесконечной загрузке. Повторяем гранты как у contracts.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contract_properties TO service_role;

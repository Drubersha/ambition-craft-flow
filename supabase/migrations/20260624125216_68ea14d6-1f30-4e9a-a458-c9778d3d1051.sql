
DROP POLICY IF EXISTS "tasks demo all" ON public.tasks;
DROP POLICY IF EXISTS "task_suggestions demo all" ON public.task_suggestions;

CREATE POLICY "own tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "own task_suggestions" ON public.task_suggestions
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "linked tenants view charge items"
  ON public.charge_items
  FOR SELECT TO authenticated
  USING (public.is_linked_member(owner_id, auth.uid(), 'tenant'::app_role));

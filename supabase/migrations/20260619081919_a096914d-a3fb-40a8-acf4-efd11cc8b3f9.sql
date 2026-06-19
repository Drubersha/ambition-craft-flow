
-- Folders table for organizing properties hierarchically
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  plan_path text,
  plan_mime text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own folders" ON public.folders
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_folders_owner ON public.folders(owner_id);
CREATE INDEX idx_folders_parent ON public.folders(parent_id);

CREATE TRIGGER trg_folders_updated BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Prevent cycles when moving a folder
CREATE OR REPLACE FUNCTION public.folders_prevent_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cur uuid := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Folder cannot be its own parent';
  END IF;
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Cycle detected in folder hierarchy';
    END IF;
    SELECT parent_id INTO cur FROM public.folders WHERE id = cur;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_folders_no_cycle BEFORE INSERT OR UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.folders_prevent_cycle();

-- Add folder + plan to properties
ALTER TABLE public.properties
  ADD COLUMN folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  ADD COLUMN plan_path text,
  ADD COLUMN plan_mime text;

CREATE INDEX idx_properties_folder ON public.properties(folder_id);

-- Storage policies for plans in the 'documents' bucket
-- Files live under: folder-plans/{folder_id}/... and property-plans/{property_id}/...

CREATE POLICY "folder plans: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'folder-plans'
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id::text = (storage.foldername(name))[2]
        AND f.owner_id = auth.uid()
    )
  );

CREATE POLICY "folder plans: owner write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'folder-plans'
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id::text = (storage.foldername(name))[2]
        AND f.owner_id = auth.uid()
    )
  );

CREATE POLICY "folder plans: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'folder-plans'
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id::text = (storage.foldername(name))[2]
        AND f.owner_id = auth.uid()
    )
  );

CREATE POLICY "folder plans: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'folder-plans'
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id::text = (storage.foldername(name))[2]
        AND f.owner_id = auth.uid()
    )
  );

CREATE POLICY "property plans: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'property-plans'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "property plans: owner write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'property-plans'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "property plans: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'property-plans'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "property plans: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'property-plans'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.owner_id = auth.uid()
    )
  );

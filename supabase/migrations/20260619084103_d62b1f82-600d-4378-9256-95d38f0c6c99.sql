
DROP POLICY IF EXISTS "folder plans: owner read" ON storage.objects;
DROP POLICY IF EXISTS "folder plans: owner write" ON storage.objects;
DROP POLICY IF EXISTS "folder plans: owner update" ON storage.objects;
DROP POLICY IF EXISTS "folder plans: owner delete" ON storage.objects;
DROP POLICY IF EXISTS "property plans: owner read" ON storage.objects;
DROP POLICY IF EXISTS "property plans: owner write" ON storage.objects;
DROP POLICY IF EXISTS "property plans: owner update" ON storage.objects;
DROP POLICY IF EXISTS "property plans: owner delete" ON storage.objects;

CREATE POLICY "folder plans: owner read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'folder-plans'
  AND EXISTS (SELECT 1 FROM public.folders f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[2]
      AND f.owner_id = auth.uid())
);

CREATE POLICY "folder plans: owner write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'folder-plans'
  AND EXISTS (SELECT 1 FROM public.folders f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[2]
      AND f.owner_id = auth.uid())
);

CREATE POLICY "folder plans: owner update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'folder-plans'
  AND EXISTS (SELECT 1 FROM public.folders f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[2]
      AND f.owner_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'folder-plans'
  AND EXISTS (SELECT 1 FROM public.folders f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[2]
      AND f.owner_id = auth.uid())
);

CREATE POLICY "folder plans: owner delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'folder-plans'
  AND EXISTS (SELECT 1 FROM public.folders f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[2]
      AND f.owner_id = auth.uid())
);

CREATE POLICY "property plans: owner read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'property-plans'
  AND EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = auth.uid())
);

CREATE POLICY "property plans: owner write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'property-plans'
  AND EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = auth.uid())
);

CREATE POLICY "property plans: owner update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'property-plans'
  AND EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'property-plans'
  AND EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = auth.uid())
);

CREATE POLICY "property plans: owner delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(storage.objects.name))[1] = 'property-plans'
  AND EXISTS (SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[2]
      AND p.owner_id = auth.uid())
);

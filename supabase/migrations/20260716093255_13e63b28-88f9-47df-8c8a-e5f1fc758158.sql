-- Allow uploads/reads/deletes on media bucket under templates/ prefix without requiring auth (single-user app)
DROP POLICY IF EXISTS "templates public read" ON storage.objects;
DROP POLICY IF EXISTS "templates public insert" ON storage.objects;
DROP POLICY IF EXISTS "templates public update" ON storage.objects;
DROP POLICY IF EXISTS "templates public delete" ON storage.objects;

CREATE POLICY "templates public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'templates');

CREATE POLICY "templates public insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = 'templates');

CREATE POLICY "templates public update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'templates');

CREATE POLICY "templates public delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'templates');
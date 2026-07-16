
-- Storage policies for the private "media" bucket: users can only touch files inside their own folder (path prefix = user id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='media read own') THEN
    CREATE POLICY "media read own" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='media insert own') THEN
    CREATE POLICY "media insert own" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='media update own') THEN
    CREATE POLICY "media update own" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='media delete own') THEN
    CREATE POLICY "media delete own" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END$$;


CREATE POLICY "videos bucket public all" ON storage.objects
  FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');

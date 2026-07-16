
CREATE POLICY "own media files select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own media files insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own media files update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own media files delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

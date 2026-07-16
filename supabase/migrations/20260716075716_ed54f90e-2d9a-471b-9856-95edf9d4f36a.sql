
CREATE POLICY "public storage read" ON storage.objects FOR SELECT USING (bucket_id IN ('videos-original','videos-processed','brand-assets'));
CREATE POLICY "public storage insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('videos-original','videos-processed','brand-assets'));
CREATE POLICY "public storage update" ON storage.objects FOR UPDATE USING (bucket_id IN ('videos-original','videos-processed','brand-assets'));
CREATE POLICY "public storage delete" ON storage.objects FOR DELETE USING (bucket_id IN ('videos-original','videos-processed','brand-assets'));

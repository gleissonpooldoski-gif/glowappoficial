DELETE FROM public.videos v
WHERE v.status IN ('uploaded','processing')
  AND v.original_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'videos' AND o.name = v.original_path
  );

UPDATE public.videos v
SET thumbnail_path = NULL, thumbnail_url = NULL
WHERE v.thumbnail_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'videos' AND o.name = v.thumbnail_path
  );

UPDATE public.videos
SET status = 'uploaded', updated_at = now()
WHERE status = 'processing' AND original_path IS NOT NULL;
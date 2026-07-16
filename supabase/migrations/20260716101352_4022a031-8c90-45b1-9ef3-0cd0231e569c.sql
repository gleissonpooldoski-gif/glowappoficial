ALTER TABLE public.edits
  ADD COLUMN IF NOT EXISTS video_filename TEXT,
  ADD COLUMN IF NOT EXISTS video_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'single-user';

UPDATE public.edits e
SET
  video_filename = COALESCE(e.video_filename, v.filename),
  video_storage_path = COALESCE(e.video_storage_path, v.original_path),
  owner_user_id = COALESCE(NULLIF(e.owner_user_id, ''), e.user_id, 'single-user')
FROM public.videos v
WHERE e.video_id = v.id;

CREATE INDEX IF NOT EXISTS edits_owner_user_id_idx ON public.edits(owner_user_id);
CREATE INDEX IF NOT EXISTS edits_video_storage_path_idx ON public.edits(video_storage_path);
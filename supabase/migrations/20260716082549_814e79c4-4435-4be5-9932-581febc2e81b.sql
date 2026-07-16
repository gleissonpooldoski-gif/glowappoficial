ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS videos_file_hash_unique ON public.videos(file_hash) WHERE file_hash IS NOT NULL;
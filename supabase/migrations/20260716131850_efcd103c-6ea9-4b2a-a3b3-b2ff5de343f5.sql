DROP INDEX IF EXISTS public.videos_file_hash_unique;
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_file_hash_unique;
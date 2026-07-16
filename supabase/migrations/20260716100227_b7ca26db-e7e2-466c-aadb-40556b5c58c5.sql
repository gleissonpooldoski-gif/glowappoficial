ALTER TABLE public.edits
  ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'single-user',
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS template_url TEXT;

UPDATE public.edits e
SET template_url = COALESCE(e.template_url, t.preview_url)
FROM public.templates t
WHERE e.template_id = t.id;

CREATE INDEX IF NOT EXISTS edits_user_id_idx ON public.edits(user_id);
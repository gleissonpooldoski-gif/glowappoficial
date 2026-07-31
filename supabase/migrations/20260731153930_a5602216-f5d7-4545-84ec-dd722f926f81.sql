CREATE TABLE IF NOT EXISTS public.video_ai_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  video_id UUID,
  analysis JSONB,
  summary TEXT,
  objects TEXT[],
  ocr TEXT[],
  niche TEXT,
  title TEXT,
  caption TEXT,
  cta TEXT,
  hashtags JSONB,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_ai_cache_video_id_idx ON public.video_ai_cache (video_id);

GRANT ALL ON public.video_ai_cache TO service_role;

ALTER TABLE public.video_ai_cache ENABLE ROW LEVEL SECURITY;
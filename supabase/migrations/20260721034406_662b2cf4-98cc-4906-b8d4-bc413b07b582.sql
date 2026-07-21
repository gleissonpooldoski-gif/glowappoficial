
-- Tabela de publicações do YouTube (agendamento e histórico)
CREATE TABLE public.youtube_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  account TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  category_id TEXT DEFAULT '22',
  privacy_status TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'AGENDADO', -- AGENDADO | PUBLICANDO | PUBLICADO | ERRO
  youtube_video_id TEXT,
  video_url TEXT,
  error_message TEXT,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_posts TO authenticated;
GRANT ALL ON public.youtube_posts TO service_role;

ALTER TABLE public.youtube_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem gerenciar youtube_posts (single-user)"
  ON public.youtube_posts FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_youtube_posts_status_scheduled ON public.youtube_posts (status, scheduled_at);
CREATE INDEX idx_youtube_posts_video ON public.youtube_posts (video_id);

CREATE TRIGGER update_youtube_posts_updated_at
  BEFORE UPDATE ON public.youtube_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registro consolidado de agendamentos multi-rede (referencial).
-- Guarda em quais redes o mesmo vídeo foi agendado no mesmo horário.
CREATE TABLE public.publish_schedules_multi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  networks TEXT[] NOT NULL DEFAULT '{}', -- ['instagram','youtube','tiktok']
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  instagram_post_id UUID REFERENCES public.instagram_posts(id) ON DELETE SET NULL,
  youtube_post_id UUID REFERENCES public.youtube_posts(id) ON DELETE SET NULL,
  tiktok_post_id UUID REFERENCES public.tiktok_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_schedules_multi TO authenticated;
GRANT ALL ON public.publish_schedules_multi TO service_role;

ALTER TABLE public.publish_schedules_multi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos podem gerenciar publish_schedules_multi"
  ON public.publish_schedules_multi FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_psm_scheduled ON public.publish_schedules_multi (scheduled_at);

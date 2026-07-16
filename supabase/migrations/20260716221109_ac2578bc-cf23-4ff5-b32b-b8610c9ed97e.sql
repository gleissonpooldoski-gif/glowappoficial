
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  account text NOT NULL CHECK (account IN ('resenha','frame')),
  caption text NOT NULL DEFAULT '',
  hashtags text NOT NULL DEFAULT '',
  publish_id text,
  container_id text,
  status text NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','PUBLICANDO','PUBLICADO','ERRO')),
  video_url text,
  thumbnail_url text,
  error_message text,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_posts TO authenticated;
GRANT ALL ON public.instagram_posts TO service_role;

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal app - open access instagram_posts"
  ON public.instagram_posts FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_instagram_posts_updated_at
  BEFORE UPDATE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_instagram_posts_status ON public.instagram_posts(status);
CREATE INDEX idx_instagram_posts_scheduled_at ON public.instagram_posts(scheduled_at) WHERE status = 'AGENDADO';

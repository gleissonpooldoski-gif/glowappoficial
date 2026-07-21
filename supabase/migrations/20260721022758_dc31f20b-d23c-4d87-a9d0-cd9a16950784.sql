
CREATE TABLE IF NOT EXISTS public.tiktok_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account TEXT NOT NULL UNIQUE CHECK (account IN ('resenha','frame')),
  open_id TEXT,
  username TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scope TEXT,
  last_validated_at TIMESTAMPTZ,
  last_validation_status TEXT,
  last_validation_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.tiktok_credentials TO service_role;

ALTER TABLE public.tiktok_credentials ENABLE ROW LEVEL SECURITY;

-- Sem policies para anon/authenticated: acesso somente via edge functions (service_role).

CREATE TRIGGER trg_tiktok_credentials_updated
  BEFORE UPDATE ON public.tiktok_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Estado temporário do OAuth (CSRF state por conta)
CREATE TABLE IF NOT EXISTS public.tiktok_oauth_states (
  state TEXT PRIMARY KEY,
  account TEXT NOT NULL CHECK (account IN ('resenha','frame')),
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.tiktok_oauth_states TO service_role;
ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;

-- Adiciona coluna para posts TikTok reaproveitando instagram_posts? Não: criamos tabela dedicada
CREATE TABLE IF NOT EXISTS public.tiktok_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  account TEXT NOT NULL CHECK (account IN ('resenha','frame')),
  caption TEXT NOT NULL DEFAULT '',
  publish_id TEXT,
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','PUBLICANDO','PUBLICADO','ERRO')),
  video_url TEXT,
  error_message TEXT,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_posts TO authenticated;
GRANT SELECT ON public.tiktok_posts TO anon;
GRANT ALL ON public.tiktok_posts TO service_role;

ALTER TABLE public.tiktok_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiktok_posts read all" ON public.tiktok_posts FOR SELECT USING (true);
CREATE POLICY "tiktok_posts write all" ON public.tiktok_posts FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_tiktok_posts_updated
  BEFORE UPDATE ON public.tiktok_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tiktok_posts_status_scheduled ON public.tiktok_posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_video ON public.tiktok_posts(video_id);

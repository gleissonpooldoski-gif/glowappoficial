
-- Drop old
DROP TABLE IF EXISTS public.publication_logs CASCADE;
DROP TABLE IF EXISTS public.scheduled_posts CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.media CASCADE;
DROP TABLE IF EXISTS public.social_accounts CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TYPE IF EXISTS public.post_status CASCADE;
DROP TYPE IF EXISTS public.social_network CASCADE;
DROP TYPE IF EXISTS public.account_status CASCADE;
DROP TYPE IF EXISTS public.media_type CASCADE;

-- Enums
CREATE TYPE public.project_category AS ENUM ('motivacao','dinheiro','curiosidades','luxo','saude','futebol','noticias','celebridades','outro');
CREATE TYPE public.video_status AS ENUM ('uploaded','queued','processing','finished','error');
CREATE TYPE public.queue_status AS ENUM ('pending','processing','done','error');
CREATE TYPE public.watermark_position AS ENUM ('top-left','top-right','bottom-left','bottom-right');

-- projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category public.project_category NOT NULL DEFAULT 'outro',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.projects TO anon, authenticated, service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- videos
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_path TEXT,
  original_url TEXT,
  processed_path TEXT,
  processed_url TEXT,
  duration_seconds NUMERIC,
  size_bytes BIGINT,
  mime_type TEXT,
  status public.video_status NOT NULL DEFAULT 'uploaded',
  template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.videos TO anon, authenticated, service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.videos FOR ALL USING (true) WITH CHECK (true);

-- templates
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  preview_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.templates TO anon, authenticated, service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.templates FOR ALL USING (true) WITH CHECK (true);

-- brand_settings (single-row usage but table for flexibility)
CREATE TABLE public.brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  page_name TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#D4AF37',
  secondary_color TEXT DEFAULT '#FFFFFF',
  font TEXT DEFAULT 'Montserrat',
  watermark_enabled BOOLEAN NOT NULL DEFAULT true,
  watermark_position public.watermark_position NOT NULL DEFAULT 'bottom-right',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.brand_settings TO anon, authenticated, service_role;
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.brand_settings FOR ALL USING (true) WITH CHECK (true);

-- processing_queue
CREATE TABLE public.processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brand_settings(id) ON DELETE SET NULL,
  status public.queue_status NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.processing_queue TO anon, authenticated, service_role;
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.processing_queue FOR ALL USING (true) WITH CHECK (true);

-- app_settings
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_location TEXT DEFAULT 'supabase',
  default_quality TEXT DEFAULT '1080p',
  default_format TEXT DEFAULT '9:16',
  auto_cleanup BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO anon, authenticated, service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public access" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Update triggers
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_videos_updated BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_brand_updated BEFORE UPDATE ON public.brand_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_queue_updated BEFORE UPDATE ON public.processing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_appset_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed templates
INSERT INTO public.templates (name, description, settings, is_builtin) VALUES
('Dark Gold','Fundo preto, elementos dourados, estilo premium com legendas elegantes.', '{"bg":"#050505","accent":"#D4AF37","captions":"elegant","logo":true}'::jsonb, true),
('Viral Reels','Legendas grandes, palavras destacadas, zoom automático e cortes rápidos.', '{"captions":"bold","highlight":true,"zoom":true,"cuts":"fast"}'::jsonb, true),
('Podcast','Moldura moderna, layout central e legenda dinâmica.', '{"layout":"center","frame":"modern","captions":"dynamic"}'::jsonb, true),
('News','Manchete superior, barra de informação e texto inferior estilo jornal.', '{"headline":true,"ticker":true,"style":"news"}'::jsonb, true),
('Minimal','Design limpo, poucos elementos, elegante.', '{"style":"minimal"}'::jsonb, true);

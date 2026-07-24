
DO $$ BEGIN
  CREATE TYPE public.publish_queue_status AS ENUM (
    'PENDING', 'PROCESSING', 'PUBLISHED', 'RETRYING', 'FAILED', 'NEEDS_ATTENTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.publish_platform AS ENUM ('instagram', 'facebook', 'youtube', 'tiktok');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connection_health_status AS ENUM ('connected', 'expiring_soon', 'expired', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID,
  project_id UUID,
  platform public.publish_platform NOT NULL,
  platform_post_id UUID,
  account_ref TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status public.publish_queue_status NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  last_error TEXT,
  last_error_code TEXT,
  next_attempt_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  caption TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT publish_queue_platform_post_unique UNIQUE (platform, platform_post_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_queue TO authenticated;
GRANT ALL ON public.publish_queue TO service_role;

ALTER TABLE public.publish_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read publish_queue" ON public.publish_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write publish_queue" ON public.publish_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update publish_queue" ON public.publish_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete publish_queue" ON public.publish_queue FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_publish_queue_ready ON public.publish_queue (status, next_attempt_at) WHERE status IN ('PENDING','RETRYING');
CREATE INDEX IF NOT EXISTS idx_publish_queue_scheduled ON public.publish_queue (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_queue_project_platform ON public.publish_queue (project_id, platform);
CREATE INDEX IF NOT EXISTS idx_publish_queue_video ON public.publish_queue (video_id);
CREATE INDEX IF NOT EXISTS idx_publish_queue_status ON public.publish_queue (status);

CREATE TRIGGER trg_publish_queue_updated_at BEFORE UPDATE ON public.publish_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.connection_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.publish_platform NOT NULL,
  account_ref TEXT NOT NULL,
  project_id UUID,
  status public.connection_health_status NOT NULL DEFAULT 'unknown',
  last_check TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  error_reason TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connection_health_unique UNIQUE (platform, account_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_health TO authenticated;
GRANT ALL ON public.connection_health TO service_role;

ALTER TABLE public.connection_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read connection_health" ON public.connection_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated manage connection_health" ON public.connection_health FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_connection_health_status ON public.connection_health (status);
CREATE INDEX IF NOT EXISTS idx_connection_health_project ON public.connection_health (project_id, platform);

CREATE TRIGGER trg_connection_health_updated_at BEFORE UPDATE ON public.connection_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.map_platform_status_to_queue(_status TEXT)
RETURNS public.publish_queue_status LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _status IN ('AGENDADO','SCHEDULED','scheduled') THEN 'PENDING'::public.publish_queue_status
    WHEN _status IN ('PUBLICANDO','PUBLISHING','publishing','processing','uploading') THEN 'PROCESSING'::public.publish_queue_status
    WHEN _status IN ('PUBLICADO','PUBLISHED','published','completed','success') THEN 'PUBLISHED'::public.publish_queue_status
    WHEN _status IN ('ERRO','ERROR','error','failed') THEN 'NEEDS_ATTENTION'::public.publish_queue_status
    WHEN _status IN ('CANCELADO','CANCELED','canceled','cancelled') THEN 'FAILED'::public.publish_queue_status
    ELSE 'PENDING'::public.publish_queue_status
  END;
$$;

INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption, metadata)
SELECT ip.video_id, 'instagram', ip.id, ip.account,
  COALESCE(ip.scheduled_at, ip.published_at, ip.created_at, now()),
  public.map_platform_status_to_queue(ip.status::text),
  ip.published_at, ip.error_message, ip.caption,
  jsonb_build_object('backfilled_at', now(), 'source', 'instagram_posts')
FROM public.instagram_posts ip
ON CONFLICT (platform, platform_post_id) DO NOTHING;

INSERT INTO public.publish_queue (video_id, project_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption, metadata)
SELECT fp.video_id, fp.project_id, 'facebook', fp.id, fp.page_id,
  COALESCE(fp.scheduled_at, fp.published_at, fp.created_at, now()),
  public.map_platform_status_to_queue(fp.status::text),
  fp.published_at, fp.error_message, fp.description,
  jsonb_build_object('backfilled_at', now(), 'source', 'facebook_posts', 'fb_video_id', fp.fb_video_id, 'page_name', fp.page_name)
FROM public.facebook_posts fp
ON CONFLICT (platform, platform_post_id) DO NOTHING;

INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption, metadata)
SELECT yp.video_id, 'youtube', yp.id, yp.account,
  COALESCE(yp.scheduled_at, yp.published_at, yp.created_at, now()),
  public.map_platform_status_to_queue(yp.status::text),
  yp.published_at, yp.error_message, yp.title,
  jsonb_build_object('backfilled_at', now(), 'source', 'youtube_posts', 'youtube_video_id', yp.youtube_video_id)
FROM public.youtube_posts yp
ON CONFLICT (platform, platform_post_id) DO NOTHING;

INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption, metadata)
SELECT tp.video_id, 'tiktok', tp.id, tp.account,
  COALESCE(tp.scheduled_at, tp.published_at, tp.created_at, now()),
  public.map_platform_status_to_queue(tp.status::text),
  tp.published_at, tp.error_message, tp.caption,
  jsonb_build_object('backfilled_at', now(), 'source', 'tiktok_posts')
FROM public.tiktok_posts tp
ON CONFLICT (platform, platform_post_id) DO NOTHING;

UPDATE public.publish_queue SET next_attempt_at = scheduled_at WHERE status = 'PENDING' AND next_attempt_at IS NULL;

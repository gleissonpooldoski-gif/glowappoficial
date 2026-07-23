
-- Facebook posts table (mirrors instagram_posts architecture, independent module)
CREATE TABLE IF NOT EXISTS public.facebook_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  facebook_account_id UUID REFERENCES public.facebook_accounts(id) ON DELETE SET NULL,
  page_id TEXT NOT NULL,
  page_name TEXT,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  thumbnail_url TEXT,
  fb_video_id TEXT,           -- id retornado pela Meta
  fb_post_id TEXT,             -- permalink/post id se disponível
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','PUBLICANDO','PUBLICADO','ERRO','CANCELADO')),
  error_message TEXT,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_response JSONB,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_posts TO authenticated;
GRANT ALL ON public.facebook_posts TO service_role;

ALTER TABLE public.facebook_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facebook_posts full access for authenticated"
  ON public.facebook_posts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS facebook_posts_status_scheduled_idx
  ON public.facebook_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS facebook_posts_video_idx
  ON public.facebook_posts (video_id);
CREATE INDEX IF NOT EXISTS facebook_posts_project_idx
  ON public.facebook_posts (project_id);

CREATE TRIGGER facebook_posts_updated_at
  BEFORE UPDATE ON public.facebook_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Estender publish_targets para aceitar plataforma 'facebook' e novo FK
ALTER TABLE public.publish_targets
  DROP CONSTRAINT IF EXISTS publish_targets_platform_check;
ALTER TABLE public.publish_targets
  ADD CONSTRAINT publish_targets_platform_check
  CHECK (platform IN ('instagram','youtube','tiktok','facebook'));

ALTER TABLE public.publish_targets
  ADD COLUMN IF NOT EXISTS facebook_post_id UUID REFERENCES public.facebook_posts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS publish_targets_facebook_post_id_key
  ON public.publish_targets (facebook_post_id) WHERE facebook_post_id IS NOT NULL;

-- Trigger de sincronização (mirrors sync_publish_target_ig)
CREATE OR REPLACE FUNCTION public.sync_publish_target_fb()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_target_id UUID; v_norm TEXT; v_prev TEXT; v_event TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.publish_targets WHERE facebook_post_id = OLD.id;
    RETURN OLD;
  END IF;
  v_norm := public.normalize_platform_status(NEW.status);
  INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, facebook_post_id, published_at, error_message)
  VALUES (NEW.video_id, NEW.scheduled_at, 'facebook', v_norm, NEW.page_id, NEW.id, NEW.published_at, NEW.error_message)
  ON CONFLICT (facebook_post_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status, account = EXCLUDED.account,
        published_at = EXCLUDED.published_at, error_message = EXCLUDED.error_message,
        updated_at = now()
  RETURNING id INTO v_target_id;

  IF TG_OP = 'UPDATE' THEN v_prev := public.normalize_platform_status(OLD.status); END IF;
  IF v_prev IS DISTINCT FROM v_norm THEN
    v_event := CASE v_norm
      WHEN 'PUBLICANDO' THEN 'facebook_publish_started'
      WHEN 'PUBLICADO'  THEN 'facebook_published'
      WHEN 'ERRO'       THEN 'facebook_publish_error'
      WHEN 'CANCELADO'  THEN 'facebook_canceled'
      ELSE 'facebook_scheduled' END;
    INSERT INTO public.publish_events(target_id, video_id, platform, event, status, detail)
    VALUES (v_target_id, NEW.video_id, 'facebook', v_event, v_norm,
            jsonb_build_object('post_id', NEW.id, 'fb_video_id', NEW.fb_video_id, 'error', NEW.error_message));
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS facebook_posts_sync_target ON public.facebook_posts;
CREATE TRIGGER facebook_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.facebook_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_fb();


-- 1) TABELAS
CREATE TABLE IF NOT EXISTS public.publish_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID,
  scheduled_at TIMESTAMPTZ,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','youtube','tiktok')),
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','PUBLICANDO','PUBLICADO','ERRO','CANCELADO')),
  account TEXT,
  instagram_post_id UUID REFERENCES public.instagram_posts(id) ON DELETE CASCADE UNIQUE,
  youtube_post_id UUID REFERENCES public.youtube_posts(id) ON DELETE CASCADE UNIQUE,
  tiktok_post_id UUID REFERENCES public.tiktok_posts(id) ON DELETE CASCADE UNIQUE,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_targets TO authenticated;
GRANT ALL ON public.publish_targets TO service_role;
ALTER TABLE public.publish_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publish_targets full access for authenticated"
  ON public.publish_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS publish_targets_video_time_idx ON public.publish_targets (video_id, scheduled_at);
CREATE INDEX IF NOT EXISTS publish_targets_status_idx ON public.publish_targets (status, scheduled_at);
CREATE INDEX IF NOT EXISTS publish_targets_platform_idx ON public.publish_targets (platform, status);

CREATE TRIGGER publish_targets_updated_at
BEFORE UPDATE ON public.publish_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.publish_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID REFERENCES public.publish_targets(id) ON DELETE CASCADE,
  video_id UUID,
  platform TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.publish_events TO authenticated;
GRANT ALL ON public.publish_events TO service_role;
ALTER TABLE public.publish_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publish_events readable authenticated"
  ON public.publish_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "publish_events insert authenticated"
  ON public.publish_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS publish_events_target_idx ON public.publish_events (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publish_events_video_idx ON public.publish_events (video_id, created_at DESC);

-- 2) helper de normalização de status
CREATE OR REPLACE FUNCTION public.normalize_platform_status(_status TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _status IN ('AGENDADO','SCHEDULED','scheduled') THEN 'AGENDADO'
    WHEN _status IN ('PUBLICANDO','PUBLISHING','publishing','processing','uploading') THEN 'PUBLICANDO'
    WHEN _status IN ('PUBLICADO','PUBLISHED','published','completed','success') THEN 'PUBLICADO'
    WHEN _status IN ('ERRO','ERROR','error','failed') THEN 'ERRO'
    WHEN _status IN ('CANCELADO','CANCELED','canceled','cancelled') THEN 'CANCELADO'
    ELSE COALESCE(_status, 'AGENDADO')
  END;
$$;

-- 3) TRIGGERS por plataforma
CREATE OR REPLACE FUNCTION public.sync_publish_target_ig()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target_id UUID; v_norm TEXT; v_prev TEXT; v_event TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.publish_targets WHERE instagram_post_id = OLD.id;
    RETURN OLD;
  END IF;
  v_norm := public.normalize_platform_status(NEW.status);
  INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, instagram_post_id, published_at, error_message)
  VALUES (NEW.video_id, NEW.scheduled_at, 'instagram', v_norm, NEW.account, NEW.id, NEW.published_at, NEW.error_message)
  ON CONFLICT (instagram_post_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status, account = EXCLUDED.account,
        published_at = EXCLUDED.published_at, error_message = EXCLUDED.error_message,
        updated_at = now()
  RETURNING id INTO v_target_id;

  IF TG_OP = 'UPDATE' THEN v_prev := public.normalize_platform_status(OLD.status); END IF;
  IF v_prev IS DISTINCT FROM v_norm THEN
    v_event := CASE v_norm
      WHEN 'PUBLICANDO' THEN 'instagram_publish_started'
      WHEN 'PUBLICADO'  THEN 'instagram_published'
      WHEN 'ERRO'       THEN 'instagram_publish_error'
      WHEN 'CANCELADO'  THEN 'instagram_canceled'
      ELSE 'instagram_scheduled' END;
    INSERT INTO public.publish_events(target_id, video_id, platform, event, status, detail)
    VALUES (v_target_id, NEW.video_id, 'instagram', v_event, v_norm,
            jsonb_build_object('post_id', NEW.id, 'error', NEW.error_message));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_publish_target_ig ON public.instagram_posts;
CREATE TRIGGER trg_sync_publish_target_ig
AFTER INSERT OR UPDATE OR DELETE ON public.instagram_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_ig();

CREATE OR REPLACE FUNCTION public.sync_publish_target_yt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target_id UUID; v_norm TEXT; v_prev TEXT; v_event TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.publish_targets WHERE youtube_post_id = OLD.id;
    RETURN OLD;
  END IF;
  v_norm := public.normalize_platform_status(NEW.status);
  INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, youtube_post_id, published_at, error_message)
  VALUES (NEW.video_id, NEW.scheduled_at, 'youtube', v_norm, NEW.account, NEW.id, NEW.published_at, NEW.error_message)
  ON CONFLICT (youtube_post_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status, account = EXCLUDED.account,
        published_at = EXCLUDED.published_at, error_message = EXCLUDED.error_message,
        updated_at = now()
  RETURNING id INTO v_target_id;

  IF TG_OP = 'UPDATE' THEN v_prev := public.normalize_platform_status(OLD.status); END IF;
  IF v_prev IS DISTINCT FROM v_norm THEN
    v_event := CASE v_norm
      WHEN 'PUBLICANDO' THEN 'youtube_publish_started'
      WHEN 'PUBLICADO'  THEN 'youtube_published'
      WHEN 'ERRO'       THEN 'youtube_publish_error'
      WHEN 'CANCELADO'  THEN 'youtube_canceled'
      ELSE 'youtube_scheduled' END;
    INSERT INTO public.publish_events(target_id, video_id, platform, event, status, detail)
    VALUES (v_target_id, NEW.video_id, 'youtube', v_event, v_norm,
            jsonb_build_object('post_id', NEW.id, 'error', NEW.error_message));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_publish_target_yt ON public.youtube_posts;
CREATE TRIGGER trg_sync_publish_target_yt
AFTER INSERT OR UPDATE OR DELETE ON public.youtube_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_yt();

CREATE OR REPLACE FUNCTION public.sync_publish_target_tt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target_id UUID; v_norm TEXT; v_prev TEXT; v_event TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.publish_targets WHERE tiktok_post_id = OLD.id;
    RETURN OLD;
  END IF;
  v_norm := public.normalize_platform_status(NEW.status);
  INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, tiktok_post_id, published_at, error_message)
  VALUES (NEW.video_id, NEW.scheduled_at, 'tiktok', v_norm, NEW.account, NEW.id, NEW.published_at, NEW.error_message)
  ON CONFLICT (tiktok_post_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status, account = EXCLUDED.account,
        published_at = EXCLUDED.published_at, error_message = EXCLUDED.error_message,
        updated_at = now()
  RETURNING id INTO v_target_id;

  IF TG_OP = 'UPDATE' THEN v_prev := public.normalize_platform_status(OLD.status); END IF;
  IF v_prev IS DISTINCT FROM v_norm THEN
    v_event := CASE v_norm
      WHEN 'PUBLICANDO' THEN 'tiktok_publish_started'
      WHEN 'PUBLICADO'  THEN 'tiktok_published'
      WHEN 'ERRO'       THEN 'tiktok_publish_error'
      WHEN 'CANCELADO'  THEN 'tiktok_canceled'
      ELSE 'tiktok_scheduled' END;
    INSERT INTO public.publish_events(target_id, video_id, platform, event, status, detail)
    VALUES (v_target_id, NEW.video_id, 'tiktok', v_event, v_norm,
            jsonb_build_object('post_id', NEW.id, 'error', NEW.error_message));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_publish_target_tt ON public.tiktok_posts;
CREATE TRIGGER trg_sync_publish_target_tt
AFTER INSERT OR UPDATE OR DELETE ON public.tiktok_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_tt();

-- 4) BACKFILL
INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, instagram_post_id, published_at, error_message)
SELECT video_id, scheduled_at, 'instagram', public.normalize_platform_status(status), account, id, published_at, error_message
FROM public.instagram_posts
ON CONFLICT (instagram_post_id) DO NOTHING;

INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, youtube_post_id, published_at, error_message)
SELECT video_id, scheduled_at, 'youtube', public.normalize_platform_status(status), account, id, published_at, error_message
FROM public.youtube_posts
ON CONFLICT (youtube_post_id) DO NOTHING;

INSERT INTO public.publish_targets(video_id, scheduled_at, platform, status, account, tiktok_post_id, published_at, error_message)
SELECT video_id, scheduled_at, 'tiktok', public.normalize_platform_status(status), account, id, published_at, error_message
FROM public.tiktok_posts
ON CONFLICT (tiktok_post_id) DO NOTHING;

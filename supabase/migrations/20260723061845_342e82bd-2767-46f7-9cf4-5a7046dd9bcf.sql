
-- Função genérica que replica o comportamento do IG para as demais plataformas
CREATE OR REPLACE FUNCTION public.sync_video_status_from_platform()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.video_id;
  ELSE
    v_id := NEW.video_id;
  END IF;
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Se qualquer plataforma marcou PUBLICADO, o vídeo vira 'published'
  IF EXISTS (SELECT 1 FROM public.instagram_posts WHERE video_id = v_id AND status = 'PUBLICADO')
     OR EXISTS (SELECT 1 FROM public.facebook_posts  WHERE video_id = v_id AND status = 'PUBLICADO')
     OR EXISTS (SELECT 1 FROM public.youtube_posts   WHERE video_id = v_id AND status = 'PUBLICADO')
     OR EXISTS (SELECT 1 FROM public.tiktok_posts    WHERE video_id = v_id AND status = 'PUBLICADO')
  THEN
    UPDATE public.videos
       SET status = 'published'::video_status, updated_at = now()
     WHERE id = v_id AND status <> 'published'::video_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_status_from_fb ON public.facebook_posts;
CREATE TRIGGER trg_sync_video_status_from_fb
AFTER INSERT OR UPDATE OR DELETE ON public.facebook_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_video_status_from_platform();

DROP TRIGGER IF EXISTS trg_sync_video_status_from_yt ON public.youtube_posts;
CREATE TRIGGER trg_sync_video_status_from_yt
AFTER INSERT OR UPDATE OR DELETE ON public.youtube_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_video_status_from_platform();

DROP TRIGGER IF EXISTS trg_sync_video_status_from_tt ON public.tiktok_posts;
CREATE TRIGGER trg_sync_video_status_from_tt
AFTER INSERT OR UPDATE OR DELETE ON public.tiktok_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_video_status_from_platform();

-- Backfill: qualquer vídeo já publicado em FB/YT/TT que ficou como 'completed'
UPDATE public.videos v
   SET status = 'published'::video_status, updated_at = now()
 WHERE v.status <> 'published'::video_status
   AND (
     EXISTS (SELECT 1 FROM public.facebook_posts p WHERE p.video_id = v.id AND p.status = 'PUBLICADO')
     OR EXISTS (SELECT 1 FROM public.youtube_posts p WHERE p.video_id = v.id AND p.status = 'PUBLICADO')
     OR EXISTS (SELECT 1 FROM public.tiktok_posts p WHERE p.video_id = v.id AND p.status = 'PUBLICADO')
   );

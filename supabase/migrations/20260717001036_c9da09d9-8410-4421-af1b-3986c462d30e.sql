
CREATE OR REPLACE FUNCTION public.sync_video_status_from_ig()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  has_active BOOLEAN;
  has_published BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.video_id;
  ELSE
    v_id := NEW.video_id;
  END IF;
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.instagram_posts
    WHERE video_id = v_id AND status = 'PUBLICADO'
  ) INTO has_published;

  IF has_published THEN
    UPDATE public.videos
       SET status = 'published'::video_status, updated_at = now()
     WHERE id = v_id AND status <> 'published'::video_status;
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.instagram_posts
    WHERE video_id = v_id AND status IN ('AGENDADO', 'PUBLICANDO')
  ) INTO has_active;

  IF has_active THEN
    UPDATE public.videos
       SET status = 'scheduled'::video_status, updated_at = now()
     WHERE id = v_id AND status NOT IN ('scheduled'::video_status, 'published'::video_status);
  ELSE
    UPDATE public.videos
       SET status = 'completed'::video_status, updated_at = now()
     WHERE id = v_id
       AND status = 'scheduled'::video_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ig_publish_mark_video ON public.instagram_posts;
DROP TRIGGER IF EXISTS trg_sync_video_status_from_ig ON public.instagram_posts;

CREATE TRIGGER trg_sync_video_status_from_ig
AFTER INSERT OR UPDATE OR DELETE ON public.instagram_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_video_status_from_ig();

UPDATE public.videos v
   SET status = 'scheduled'::video_status, updated_at = now()
  FROM public.instagram_posts p
 WHERE p.video_id = v.id
   AND p.status IN ('AGENDADO', 'PUBLICANDO')
   AND v.status = 'completed'::video_status;

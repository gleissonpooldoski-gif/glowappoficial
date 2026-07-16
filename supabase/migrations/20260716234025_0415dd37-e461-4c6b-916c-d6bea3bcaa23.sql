
CREATE OR REPLACE FUNCTION public.mark_video_published_on_ig_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'PUBLICADO'
     AND NEW.video_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    UPDATE public.videos
       SET status = 'published'::video_status,
           updated_at = now()
     WHERE id = NEW.video_id
       AND status <> 'published'::video_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ig_publish_mark_video ON public.instagram_posts;
CREATE TRIGGER trg_ig_publish_mark_video
AFTER INSERT OR UPDATE OF status ON public.instagram_posts
FOR EACH ROW EXECUTE FUNCTION public.mark_video_published_on_ig_publish();

UPDATE public.videos v
   SET status = 'published'::video_status,
       updated_at = now()
  FROM public.instagram_posts p
 WHERE p.video_id = v.id
   AND p.status = 'PUBLICADO'
   AND v.status <> 'published'::video_status;

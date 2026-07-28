CREATE OR REPLACE FUNCTION public.sync_publish_queue()
RETURNS TABLE(synced integer, removed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_synced integer := 0;
  v_removed integer := 0;
  v_count integer;
BEGIN
  -- Instagram
  INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption)
  SELECT p.video_id, 'instagram'::public.publish_platform, p.id, p.account, p.scheduled_at,
         public.map_platform_status_to_queue(p.status), p.published_at, p.error_message, p.caption
  FROM public.instagram_posts p
  WHERE p.scheduled_at IS NOT NULL
  ON CONFLICT (platform, platform_post_id) DO UPDATE
    SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at,
        published_at = EXCLUDED.published_at, last_error = EXCLUDED.last_error,
        video_id = EXCLUDED.video_id, account_ref = EXCLUDED.account_ref, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT; v_synced := v_synced + v_count;

  -- Facebook
  INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption)
  SELECT p.video_id, 'facebook'::public.publish_platform, p.id, p.page_id, p.scheduled_at,
         public.map_platform_status_to_queue(p.status), p.published_at, p.error_message, p.description
  FROM public.facebook_posts p
  WHERE p.scheduled_at IS NOT NULL
  ON CONFLICT (platform, platform_post_id) DO UPDATE
    SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at,
        published_at = EXCLUDED.published_at, last_error = EXCLUDED.last_error,
        video_id = EXCLUDED.video_id, account_ref = EXCLUDED.account_ref, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT; v_synced := v_synced + v_count;

  -- YouTube
  INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption)
  SELECT p.video_id, 'youtube'::public.publish_platform, p.id, p.account, p.scheduled_at,
         public.map_platform_status_to_queue(p.status), p.published_at, p.error_message, p.title
  FROM public.youtube_posts p
  WHERE p.scheduled_at IS NOT NULL
  ON CONFLICT (platform, platform_post_id) DO UPDATE
    SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at,
        published_at = EXCLUDED.published_at, last_error = EXCLUDED.last_error,
        video_id = EXCLUDED.video_id, account_ref = EXCLUDED.account_ref, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT; v_synced := v_synced + v_count;

  -- TikTok
  INSERT INTO public.publish_queue (video_id, platform, platform_post_id, account_ref, scheduled_at, status, published_at, last_error, caption)
  SELECT p.video_id, 'tiktok'::public.publish_platform, p.id, p.account, p.scheduled_at,
         public.map_platform_status_to_queue(p.status), p.published_at, p.error_message, p.caption
  FROM public.tiktok_posts p
  WHERE p.scheduled_at IS NOT NULL
  ON CONFLICT (platform, platform_post_id) DO UPDATE
    SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at,
        published_at = EXCLUDED.published_at, last_error = EXCLUDED.last_error,
        video_id = EXCLUDED.video_id, account_ref = EXCLUDED.account_ref, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT; v_synced := v_synced + v_count;

  -- Remove órfãos: itens da fila cujo post de origem não existe mais
  DELETE FROM public.publish_queue q
  WHERE q.platform_post_id IS NULL
     OR (q.platform = 'instagram' AND NOT EXISTS (SELECT 1 FROM public.instagram_posts p WHERE p.id = q.platform_post_id))
     OR (q.platform = 'facebook'  AND NOT EXISTS (SELECT 1 FROM public.facebook_posts  p WHERE p.id = q.platform_post_id))
     OR (q.platform = 'youtube'   AND NOT EXISTS (SELECT 1 FROM public.youtube_posts   p WHERE p.id = q.platform_post_id))
     OR (q.platform = 'tiktok'    AND NOT EXISTS (SELECT 1 FROM public.tiktok_posts    p WHERE p.id = q.platform_post_id));
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RETURN QUERY SELECT v_synced, v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_publish_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_publish_queue() TO service_role;
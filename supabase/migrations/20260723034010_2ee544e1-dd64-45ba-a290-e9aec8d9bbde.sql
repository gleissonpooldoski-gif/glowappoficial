-- Reinstala triggers de sincronização entre posts por plataforma e histórico unificado.
-- As funções já existem; os triggers estavam ausentes no banco ativo.

DROP TRIGGER IF EXISTS instagram_posts_sync_target ON public.instagram_posts;
CREATE TRIGGER instagram_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_ig();

DROP TRIGGER IF EXISTS youtube_posts_sync_target ON public.youtube_posts;
CREATE TRIGGER youtube_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.youtube_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_yt();

DROP TRIGGER IF EXISTS tiktok_posts_sync_target ON public.tiktok_posts;
CREATE TRIGGER tiktok_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.tiktok_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_tt();

DROP TRIGGER IF EXISTS facebook_posts_sync_target ON public.facebook_posts;
CREATE TRIGGER facebook_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.facebook_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_fb();
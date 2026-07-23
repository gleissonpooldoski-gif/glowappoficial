-- Remove apenas os triggers duplicados criados com nomes novos.
-- Mantém os triggers originais trg_sync_publish_target_* já existentes.
DROP TRIGGER IF EXISTS instagram_posts_sync_target ON public.instagram_posts;
DROP TRIGGER IF EXISTS youtube_posts_sync_target ON public.youtube_posts;
DROP TRIGGER IF EXISTS tiktok_posts_sync_target ON public.tiktok_posts;

-- Garante que o trigger necessário do Facebook permaneça ativo.
DROP TRIGGER IF EXISTS facebook_posts_sync_target ON public.facebook_posts;
CREATE TRIGGER facebook_posts_sync_target
  AFTER INSERT OR UPDATE OR DELETE ON public.facebook_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_publish_target_fb();
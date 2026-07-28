-- ============================================================
-- 1) TOKENS FORA DO ALCANCE DO NAVEGADOR (grants por coluna)
-- ============================================================

-- YouTube: hoje anon/authenticated leem a tabela inteira (access_token, refresh_token).
DROP POLICY IF EXISTS "Public can read youtube credential status" ON public.youtube_credentials;
DROP POLICY IF EXISTS "Authenticated can link youtube channel to project" ON public.youtube_credentials;

REVOKE ALL ON public.youtube_credentials FROM anon, authenticated;

GRANT SELECT (
  id, account, channel_id, channel_title, thumbnail, expires_at, scope,
  status, label, project_id, user_id,
  last_validated_at, last_validation_status, last_validation_detail,
  created_at, updated_at
) ON public.youtube_credentials TO anon, authenticated;

GRANT UPDATE (project_id, label) ON public.youtube_credentials TO anon, authenticated;
GRANT ALL ON public.youtube_credentials TO service_role;

CREATE POLICY "yt_credentials_read_safe_columns"
  ON public.youtube_credentials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "yt_credentials_link_project"
  ON public.youtube_credentials FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Facebook: policy ALL para public expunha page_access_token e user_access_token.
DROP POLICY IF EXISTS "facebook_accounts_all_access" ON public.facebook_accounts;

REVOKE ALL ON public.facebook_accounts FROM anon, authenticated;

GRANT SELECT (
  id, project_id, page_id, page_name, page_picture,
  connection_status, token_error, token_checked_at,
  connected_at, created_at, updated_at
) ON public.facebook_accounts TO anon, authenticated;

GRANT ALL ON public.facebook_accounts TO service_role;

CREATE POLICY "fb_accounts_read_safe_columns"
  ON public.facebook_accounts FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- 2) TRAVA CONTRA AGENDAMENTOS DUPLICADOS
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ig_pending_schedule
  ON public.instagram_posts (video_id, account, scheduled_at)
  WHERE status IN ('AGENDADO','PUBLICANDO') AND video_id IS NOT NULL AND scheduled_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_yt_pending_schedule
  ON public.youtube_posts (video_id, account, scheduled_at)
  WHERE status IN ('AGENDADO','PUBLICANDO') AND video_id IS NOT NULL AND scheduled_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fb_pending_schedule
  ON public.facebook_posts (video_id, page_id, scheduled_at)
  WHERE status IN ('AGENDADO','PUBLICANDO') AND video_id IS NOT NULL AND scheduled_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tt_pending_schedule
  ON public.tiktok_posts (video_id, account, scheduled_at)
  WHERE status IN ('AGENDADO','PUBLICANDO') AND video_id IS NOT NULL AND scheduled_at IS NOT NULL;

-- ============================================================
-- 3) ÍNDICES PARA OS WORKERS (rodam a cada minuto)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ig_posts_due ON public.instagram_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_yt_posts_due ON public.youtube_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_fb_posts_due ON public.facebook_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tt_posts_due ON public.tiktok_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_queue_due ON public.publish_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_events_video ON public.publish_events (video_id, created_at DESC);
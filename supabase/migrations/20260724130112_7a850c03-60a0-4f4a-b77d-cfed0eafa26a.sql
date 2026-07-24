
-- 1) Ajusta limite de tentativas e adiciona last_attempt_at
ALTER TABLE public.publish_queue
  ALTER COLUMN max_attempts SET DEFAULT 5;

UPDATE public.publish_queue SET max_attempts = 5 WHERE max_attempts < 5;

ALTER TABLE public.publish_queue
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Backfill last_attempt_at a partir de locked_at/updated_at
UPDATE public.publish_queue
  SET last_attempt_at = COALESCE(locked_at, updated_at)
  WHERE last_attempt_at IS NULL AND attempt_count > 0;

-- 2) Tabela de arquivamento (histórico permanente)
CREATE TABLE IF NOT EXISTS public.publication_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid NOT NULL,
  video_id uuid,
  project_id uuid,
  platform text NOT NULL,
  platform_post_id uuid,
  account_ref text,
  scheduled_at timestamptz,
  published_at timestamptz,
  status text NOT NULL,
  attempt_count integer DEFAULT 0,
  last_error text,
  last_error_code text,
  caption text,
  metadata jsonb DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  original_created_at timestamptz
);

GRANT SELECT ON public.publication_archive TO authenticated, anon;
GRANT ALL ON public.publication_archive TO service_role;
ALTER TABLE public.publication_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archive read all" ON public.publication_archive;
CREATE POLICY "archive read all" ON public.publication_archive FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_publication_archive_archived_at ON public.publication_archive(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_archive_video ON public.publication_archive(video_id);

-- 3) Função de manutenção: arquiva publicados > 30 dias
CREATE OR REPLACE FUNCTION public.archive_old_publish_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved integer;
BEGIN
  WITH moved_rows AS (
    DELETE FROM public.publish_queue
    WHERE status = 'PUBLISHED'
      AND published_at < now() - interval '30 days'
    RETURNING *
  )
  INSERT INTO public.publication_archive (
    original_id, video_id, project_id, platform, platform_post_id, account_ref,
    scheduled_at, published_at, status, attempt_count, last_error, last_error_code,
    caption, metadata, original_created_at
  )
  SELECT id, video_id, project_id, platform::text, platform_post_id, account_ref,
         scheduled_at, published_at, status::text, attempt_count, last_error, last_error_code,
         caption, metadata, created_at
  FROM moved_rows;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

-- 4) Cron diário de arquivamento (03:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive-publish-queue-daily') THEN
    PERFORM cron.unschedule('archive-publish-queue-daily');
  END IF;
  PERFORM cron.schedule(
    'archive-publish-queue-daily',
    '0 3 * * *',
    $cron$ SELECT public.archive_old_publish_queue(); $cron$
  );
END $$;

-- 5) Backfill: itens em RETRYING com attempt_count >= 5 => NEEDS_ATTENTION
UPDATE public.publish_queue
  SET status = 'NEEDS_ATTENTION',
      last_error = COALESCE(last_error, 'Máximo de tentativas atingido.'),
      locked_at = NULL, locked_by = NULL
  WHERE status IN ('RETRYING','PROCESSING') AND attempt_count >= 5;

-- 6) Backfill: itens presos com asset ausente (vídeos antigos sem processed_url)
--    marca as filas antigas ligadas a esses vídeos como NEEDS_ATTENTION.
UPDATE public.publish_queue q
  SET status = 'NEEDS_ATTENTION',
      last_error = 'Vídeo com problema de processamento (arquivo original ausente).',
      last_error_code = 'ASSET_MISSING',
      locked_at = NULL, locked_by = NULL
  FROM public.videos v
  WHERE q.video_id = v.id
    AND q.status IN ('RETRYING','PROCESSING','PENDING')
    AND q.attempt_count >= 2
    AND (v.processed_url IS NULL AND v.processed_path IS NULL);

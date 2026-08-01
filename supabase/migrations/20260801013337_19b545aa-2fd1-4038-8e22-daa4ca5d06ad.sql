-- 1) Limpa registros órfãos de saúde de conexão (contas que não existem mais)
DELETE FROM public.connection_health ch
WHERE ch.platform = 'youtube'
  AND NOT EXISTS (SELECT 1 FROM public.youtube_credentials y WHERE y.channel_id = ch.account_ref);

-- 2) Reagenda posts do Instagram em ERRO (credenciais já revalidadas)
WITH ig AS (
  SELECT id, row_number() OVER (ORDER BY created_at) rn
  FROM public.instagram_posts WHERE status = 'ERRO'
)
UPDATE public.instagram_posts p
SET status = 'AGENDADO',
    error_message = NULL,
    scheduled_at = now() + (ig.rn * interval '3 minutes'),
    updated_at = now()
FROM ig WHERE ig.id = p.id;

-- 3) Reagenda posts do Facebook em ERRO
WITH fb AS (
  SELECT id, row_number() OVER (ORDER BY created_at) rn
  FROM public.facebook_posts WHERE status = 'ERRO'
)
UPDATE public.facebook_posts p
SET status = 'AGENDADO',
    error_message = NULL,
    scheduled_at = now() + (fb.rn * interval '3 minutes') + interval '1 minute',
    updated_at = now()
FROM fb WHERE fb.id = p.id;

-- 4) Libera itens travados na fila unificada
UPDATE public.publish_queue
SET status = 'PENDING',
    attempt_count = 0,
    last_error = NULL,
    last_error_code = NULL,
    locked_at = NULL,
    locked_by = NULL,
    next_attempt_at = NULL,
    updated_at = now()
WHERE status IN ('NEEDS_ATTENTION', 'FAILED', 'PROCESSING');
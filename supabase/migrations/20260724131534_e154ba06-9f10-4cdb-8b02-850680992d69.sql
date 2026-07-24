
-- Reduz max_attempts padrão para novos itens
ALTER TABLE public.publish_queue ALTER COLUMN max_attempts SET DEFAULT 3;

-- Reduz max_attempts dos itens ainda pendentes (não afeta publicados)
UPDATE public.publish_queue
   SET max_attempts = 3
 WHERE status IN ('PENDING','RETRYING','PROCESSING')
   AND max_attempts > 3;

-- Move para NEEDS_ATTENTION os itens já esgotados (attempt >= 3) que ainda estão em RETRYING
UPDATE public.publish_queue
   SET status = 'NEEDS_ATTENTION',
       locked_at = NULL,
       locked_by = NULL,
       last_error = COALESCE(last_error, 'Falha persistente após 3 tentativas — requer verificação manual.')
 WHERE status = 'RETRYING'
   AND attempt_count >= 3;

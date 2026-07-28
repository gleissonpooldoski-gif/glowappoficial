-- 1) Vincula o canal da RESENHA ao seu projeto
UPDATE public.youtube_credentials
   SET project_id = '05848845-b2c3-42e2-8750-1fadde32ffd6', updated_at = now()
 WHERE account = 'UCWM1KiF2w1zRhqeI7EaoqwA' AND project_id IS NULL;

-- 2) Remapeia contas obsoletas nos posts para o canal vinculado ao projeto do vídeo
UPDATE public.youtube_posts p
   SET account = c.account, updated_at = now()
  FROM public.videos v
  JOIN public.youtube_credentials c ON c.project_id = v.project_id
 WHERE v.id = p.video_id
   AND p.status IN ('AGENDADO','ERRO')
   AND p.account IS DISTINCT FROM c.account
   AND NOT EXISTS (SELECT 1 FROM public.youtube_credentials x WHERE x.account = p.account);

-- 3) Reenfileira falhas de conexão / recursos agora que a causa raiz foi corrigida
UPDATE public.youtube_posts
   SET status = 'AGENDADO', error_message = NULL, updated_at = now()
 WHERE status = 'ERRO'
   AND (error_message ILIKE '%não conectada%' OR error_message ILIKE '%WORKER_RESOURCE_LIMIT%')
   AND EXISTS (SELECT 1 FROM public.youtube_credentials c WHERE c.account = youtube_posts.account);

-- 4) Destrava publicação presa em PUBLICANDO há mais de 1 hora
UPDATE public.youtube_posts
   SET status = 'AGENDADO', updated_at = now()
 WHERE status = 'PUBLICANDO' AND updated_at < now() - interval '1 hour';
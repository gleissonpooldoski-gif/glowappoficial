update public.youtube_credentials
set status = 'permission_denied',
    last_validated_at = now(),
    last_validation_status = 'PERMISSION_DENIED',
    last_validation_detail = 'O YouTube está recusando novos envios neste canal (403 forbidden). Causas comuns: canal novo/não verificado por telefone (youtube.com/verify), limite diário de uploads atingido ou restrição aplicada ao canal.'
where account = 'UCzBwW3AKnW5WHgydSEmOg5Q';

update public.connection_health
set status = 'expired',
    error_code = 'PERMISSION_DENIED',
    error_reason = 'Canal bloqueado para novos uploads pelo YouTube (403 forbidden).',
    last_check = now()
where platform = 'youtube' and account_ref = 'UCzBwW3AKnW5WHgydSEmOg5Q';

update public.youtube_posts
set error_message = '[PERMISSION_DENIED] O YouTube recusou o envio neste canal (403). Verifique a verificação do canal em youtube.com/verify, o limite diário de uploads e possíveis restrições. Depois reagende.'
where status = 'ERRO' and account = 'UCzBwW3AKnW5WHgydSEmOg5Q';
# Plano técnico — Redução de Egress / Network

Escopo restrito: só transferência de arquivos. Nada de IA, editor, render, agendamento, layout, publicação ou regras de negócio muda de comportamento.

## Mapa atual dos pontos de transferência

| Ponto | Situação hoje | Custo |
|---|---|---|
| `publish-instagram` | gera signed URL e a Meta puxa (PULL). Mas faz `HEAD` e, se falhar, um `GET Range 0-0` de verificação | 1 pull + verificação extra |
| `publish-facebook` | signed URL (pull) — já otimizado | 1 pull |
| `tiktok-publish` | signed URL (PULL_FROM_URL) — já otimizado | 1 pull |
| `youtube-upload` | signed URL + leitura em chunks Range e reenvio resumable (obrigatório pela API) | 1 download + 1 upload |
| `generate-caption` | baixa o MP4 para o Gemini, mas já tem `video_ai_cache` por `cache_key` | 1 download por cache miss |
| `queue-processor` | asset-guard já evita arquivo ausente, porém **valida conta só dentro do worker** — cada retry de conta morta refaz a transferência | maior desperdício |
| `VideoLibrary.tsx` | player do modal com `autoPlay`; grade já usa thumbnail | download completo ao abrir |
| `Editor.tsx` | `preload="auto"` + `preloadVideo()` forçando buffer completo | download completo por abertura |

Conclusão: a arquitetura já é majoritariamente PULL. O egress excedente vem de **retries de contas inválidas**, **pré-carregamento agressivo no front** e **verificações duplicadas (HEAD+GET)**.

## Alterações propostas

### 1. Pré-flight dentro do `queue-processor` (maior ganho)
Antes de despachar o item para o worker, validar credencial/health da plataforma reusando a lógica de `preflight-check`. Conta inválida → item vai direto para `NEEDS_ATTENTION` com motivo, **sem nenhuma transferência**. Nenhuma publicação válida é bloqueada.

### 2. Classificação permanente vs temporário
Reforçar `_shared/publish-errors.ts`: 401, 403 de autorização, `invalid_grant`, token expirado, página/canal inexistente, conta banida → **permanente**, sem novo retry até reconexão. 429/500/502/503/timeout → temporário com backoff exponencial e teto de tentativas (sem loop).

### 3. Remover verificação duplicada no `publish-instagram`
Manter apenas o `HEAD`; eliminar o fallback `GET Range` que baixa bytes só para confirmar a URL.

### 4. YouTube
Não rebaixar o vídeo em erro de autenticação: validar token antes de abrir a sessão de upload. Manter o resumable e o retry por chunk já existentes (sem reiniciar do byte 0).

### 5. IA / Gemini
Sem mudança de comportamento. Apenas garantir que o `video_ai_cache` seja consultado **antes** de qualquer download do MP4 (hoje a checagem ocorre antes, mas a chave será fixada por `video_id + versão do arquivo` para aumentar o hit rate).

### 6. Frontend — carregamento sob demanda
- `Editor.tsx`: `preload="metadata"` e `preloadVideo()` só quando a reprodução/edição realmente começa.
- `VideoLibrary.tsx`: remover `autoPlay` do modal, usar `poster` da thumbnail e `preload="metadata"`; o vídeo baixa quando o usuário der play.
- Grade continua exclusivamente com thumbnails.

### 7. Download em massa
Mantido. Acrescenta confirmação com a quantidade de vídeos e guarda contra reinício acidental/duplicado do mesmo lote.

### 8. Signed URLs
TTL mantido em 1h (necessário para o pull das plataformas). Nenhum bucket privado vira público. Reuso da mesma signed URL dentro da mesma execução em vez de gerar novamente.

### 9. Monitoramento
Registrar em `publish_events` (já existente) eventos `download_skipped`, `retry_skipped_permanent`, `cache_hit`, `bytes_transferred` — sem dados sensíveis.

## Banco
Nenhuma migração nova prevista. Se for necessário um campo para bloquear retry permanente, será reutilizado o `status = NEEDS_ATTENTION` já existente.

## Riscos e mitigação
- Pré-flight rígido demais poderia bloquear publicação válida → só bloqueia quando credencial ausente ou health `expired`.
- `preload="metadata"` pode atrasar o primeiro frame no editor → o carregamento é disparado na abertura do player, não no clique do card.

## Observação de execução
O backend está pausado, então testes de publicação/fila em ambiente real só rodam após a retomada. As alterações de frontend e de código das Edge Functions podem ser aplicadas e revisadas agora.

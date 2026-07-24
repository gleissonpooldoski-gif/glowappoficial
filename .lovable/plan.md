# Motor de Publicação Resiliente — Plano de Implementação

Objetivo: acabar com o ciclo "post falhou → descobrir depois → corrigir manual". Todo agendamento é validado antes de nascer, executado com retry inteligente, rastreado ponta-a-ponta e visível num painel de saúde.

## Arquitetura em camadas

```text
┌─────────────────────────────────────────────────────┐
│  UI: Pre-flight → Agendamento → /saude → DLQ        │
├─────────────────────────────────────────────────────┤
│  publish_queue (fila central, fonte da verdade)     │
│  ├─ PENDING → PROCESSING → PUBLISHED                │
│  └─ RETRYING → FAILED / NEEDS_ATTENTION             │
├─────────────────────────────────────────────────────┤
│  Workers por plataforma (IG/FB/YT/TT)               │
│  ├─ validam token na hora (sem cache antigo)        │
│  ├─ classificam erro: transient vs permanent        │
│  └─ agendam next_attempt_at com backoff             │
├─────────────────────────────────────────────────────┤
│  Cron: queue-processor + token-health-check         │
└─────────────────────────────────────────────────────┘
```

## Fase 1 — Fila central `publish_queue`

Nova tabela unificada — as tabelas por plataforma (`instagram_posts`, `facebook_posts`, `youtube_posts`, `tiktok_posts`) continuam existindo como registro do provedor, mas a **fila é a fonte da verdade** do ciclo de vida.

Colunas: `id`, `video_id`, `project_id`, `platform`, `platform_post_id` (FK para tabela específica), `scheduled_at`, `status`, `attempt_count`, `max_attempts` (default 4), `last_error`, `last_error_code`, `next_attempt_at`, `published_at`, `caption`, `metadata` (jsonb), timestamps.

Estados: `PENDING` · `PROCESSING` · `PUBLISHED` · `RETRYING` · `FAILED` · `NEEDS_ATTENTION`.

Índices: `(status, next_attempt_at)`, `(project_id, platform)`, `(video_id)`.

Migração de dados: backfill de todos os posts existentes das 4 tabelas para `publish_queue` mapeando status atual → novo enum. Zero perda.

## Fase 2 — Token Health Check

Nova tabela `connection_health`: `platform`, `account_id`, `project_id`, `status` (`connected` | `expiring_soon` | `expired`), `last_check`, `expires_at`, `error_reason`.

Edge Function `token-health-check` (cron diário via pg_cron, 6h da manhã):
- IG: `GET /me?fields=id` na Graph API
- FB: `GET /{page_id}?fields=access_token` + valida com `/debug_token`
- YT: tenta refresh do `refresh_token`; se falhar → expired
- TikTok: `POST /v2/user/info/`

Auto-refresh onde possível (YT sempre; Meta long-lived a cada 50 dias). Marca `expired` e dispara notificação in-app.

## Fase 3 — Retry inteligente

Classificador de erro central `classifyPublishError(platform, response)`:
- **Transient**: timeout, 5xx, rate limit (429, Meta code 2/4/17/32), network → retry
- **Permanent**: 190 (token), 200/10/803 (permissão), vídeo inválido, duplicate → `NEEDS_ATTENTION`

Backoff: `1min → 5min → 15min → 1h`, máx 4. `next_attempt_at` calculado; após 4ª tentativa transient → `FAILED`.

Novo `queue-processor` (cron a cada 1min): pega `PENDING`/`RETRYING` com `next_attempt_at <= now()`, marca `PROCESSING` com lock, chama worker da plataforma. Substitui os schedulers atuais por um único loop.

## Fase 4 — Dead Letter Queue

Página `/publicacoes-com-problema` lista `NEEDS_ATTENTION` + `FAILED`:
- Vídeo (thumb + título), rede (badge), erro traduzido em PT, data, tentativas.
- Ações: **Tentar novamente** (reset attempt_count, status → PENDING), **Reagendar** (data picker), **Reconectar rede** (abre config).
- Seleção em massa.

Dicionário `translateError(code)` para mensagens humanas ("Token do Facebook expirou. Reconecte a Página.").

## Fase 5 — Pre-flight check

Função `preflightCheck(projectId, platforms[], videoId)` chamada por **todos** os diálogos de agendamento (`InstagramPublishDialog`, `InstagramBatchScheduleDialog`, `EditPostNetworksDialog`, `BulkAddNetworksDialog`):

Valida em paralelo por plataforma: conta vinculada, token via `connection_health`, storage do vídeo acessível, formato/duração. Retorna `{ ok, blockers: [{ platform, reason, action }] }`.

Se `blockers` não vazio → UI mostra card vermelho por rede com botão "Reconectar" ou "Vincular", **desabilita botão Agendar** para as redes bloqueadas. Nunca cria linha quebrada em `publish_queue`.

## Fase 6 — Health Dashboard `/saude`

Página nova com:
- **Conexões**: card por rede/conta com status colorido, último check, expires_at, botão Reconectar.
- **Últimas 24h**: cards com contadores — Publicados / Falhas / Agendados / Aguardando retry — clicáveis (levam pra fila filtrada).
- **Timeline**: últimos eventos de `publish_events` (auto-refresh 30s).
- **Alertas ativos**: banners para tokens expirados ou plataformas em circuit-break.

Link no menu lateral + badge com contador de problemas.

## Fase 7 — Logs profissionais

`publish_events` já existe — expandir uso:
- Todo worker grava evento em cada tentativa: `attempt_started`, `api_response`, `retry_scheduled`, `moved_to_dlq`, `published`.
- Payload completo da resposta da API em `detail` (jsonb).
- Página `/saude` tem filtros: plataforma, projeto, status, período, video_id.
- Retenção 30 dias (cron de limpeza).

## Regras invioláveis (aplicadas no código)

1. Nenhum insert em `publish_queue` sem `preflightCheck` passar.
2. Todo worker chama `getFreshToken(project_id, platform)` — **nunca** usa token salvo no post.
3. Toda mudança de estado grava `publish_events`.
4. Constraint única `(platform, platform_post_id)` em `publish_queue` impede duplicata.
5. Erros nunca ficam só no console — sempre em `last_error` + `publish_events`.

## Detalhes técnicos

**Migrations (Fase 1 + 2):**
- `publish_queue` + grants + RLS por `project_id`
- `connection_health` + grants + RLS
- Backfill SQL das 4 tabelas de posts existentes
- Índices e trigger `updated_at`

**Edge Functions novas:**
- `queue-processor` (cron 1min): consome fila, dispatcher para workers
- `token-health-check` (cron 24h): valida + refresh tokens
- `preflight-check` (invocada pelo frontend)
- Refactor de `publish-instagram`, `publish-facebook`, `publish-youtube`, `publish-tiktok` para: (a) receber `queue_id`, (b) buscar token fresh, (c) classificar erro, (d) atualizar `publish_queue` + `publish_events`.

**Frontend novo/alterado:**
- `src/pages/Health.tsx` (dashboard)
- `src/pages/PublicationIssues.tsx` (DLQ)
- `src/lib/preflight.ts` (helper client)
- `src/lib/errorTranslations.ts` (dicionário PT)
- `src/hooks/useConnectionHealth.ts`
- Integração do preflight em 4 diálogos existentes
- Badge de problemas no menu

**Ordem de implementação (para poder testar incrementalmente):**
1. Migration `publish_queue` + `connection_health` + backfill
2. `errorTranslations` + classificador de erro (shared lib para Edge Functions)
3. Refactor workers para gravar em `publish_queue` + retry
4. `queue-processor` cron
5. `token-health-check` cron + página `/saude`
6. `preflightCheck` + integração nos diálogos
7. Página DLQ `/publicacoes-com-problema` + badge menu

## Escopo fora deste plano
- Não altero fluxo de upload/edição de vídeo.
- Não mudo UI de agendamento além de adicionar pre-flight blockers e o link `/saude` no menu.
- Instagram/YouTube/TikTok mantêm comportamento atual — só ganham as camadas de fila, retry, health e logs.

Confirmando este plano, começo pela Fase 1 (migration da fila + backfill) já no próximo turno.
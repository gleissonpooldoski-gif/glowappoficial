// Motor central: consome publish_queue (PENDING/RETRYING com next_attempt_at <= now)
// e delega para o worker da plataforma. Roda a cada minuto via pg_cron.
// Faz asset-guard antes de processar e persiste logs detalhados da Meta/YouTube.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { classifyPublishError, nextAttemptAt, type Platform } from "../_shared/publish-errors.ts";
import { checkAccountReady } from "../_shared/account-preflight.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WORKER_FN: Record<Platform, string> = {
  instagram: "publish-instagram",
  facebook: "publish-facebook",
  youtube: "youtube-publish-worker",
  tiktok: "tiktok-publish-worker",
};

const BATCH_SIZE = 20;
const LOCK_TIMEOUT_MS = 10 * 60_000; // 10min
const VIDEO_BUCKET = "videos-processed";

async function logEvent(queueId: string, platform: string, videoId: string | null, event: string, status: string, detail: Record<string, unknown>) {
  await supabase.from("publish_events").insert({
    target_id: queueId, video_id: videoId, platform, event, status, detail,
  });
}

// Extrai TODOS os campos úteis da resposta da API para diagnóstico
function extractApiDiagnostics(status: number, body: any) {
  const err = body?.error ?? body ?? {};
  return {
    response_code: status,
    error_message: err?.message ?? body?.message ?? null,
    error_type: err?.type ?? err?.error_type ?? null,
    facebook_error_code: err?.code ?? null,
    facebook_error_subcode: err?.error_subcode ?? null,
    fbtrace_id: err?.fbtrace_id ?? null,
    is_transient: err?.is_transient ?? null,
    youtube_reason: err?.errors?.[0]?.reason ?? null,
    raw_response: body,
  };
}

async function releaseStaleLocks() {
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  await supabase
    .from("publish_queue")
    .update({ status: "RETRYING", locked_at: null, locked_by: null, next_attempt_at: new Date().toISOString() })
    .eq("status", "PROCESSING")
    .lt("locked_at", cutoff);
}

// Guard: valida arquivo no Storage. Se ausente e attempt_count >=1, move para NEEDS_ATTENTION.
async function assetGuard(item: any): Promise<{ ok: boolean; reason?: string }> {
  if (!item.video_id) return { ok: true };
  const { data: v } = await supabase
    .from("videos")
    .select("processed_path, processed_url, original_path, original_url")
    .eq("id", item.video_id).maybeSingle();
  if (!v) return { ok: false, reason: "Vídeo removido do banco." };
  const path = v.processed_path ?? v.original_path ?? null;
  const url = v.processed_url ?? v.original_url ?? null;
  if (!path && !url) return { ok: false, reason: "Vídeo com problema de processamento (arquivo ausente)." };
  if (path) {
    try {
      const folder = path.split("/").slice(0, -1).join("/");
      const filename = path.split("/").pop()!;
      const { data: list } = await supabase.storage.from(VIDEO_BUCKET).list(folder, { search: filename, limit: 1 });
      const found = (list ?? []).find((f) => f.name === filename);
      if (!found) return { ok: false, reason: "Arquivo de vídeo não encontrado no Storage." };
    } catch (e) {
      return { ok: false, reason: `Storage inacessível: ${String(e)}` };
    }
  }
  return { ok: true };
}

async function claimBatch(): Promise<any[]> {
  const now = new Date().toISOString();
  const { data: candidates } = await supabase
    .from("publish_queue")
    .select("id, platform, video_id, platform_post_id, project_id, account_ref, scheduled_at, attempt_count, max_attempts")
    .in("status", ["PENDING", "RETRYING"])
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!candidates?.length) return [];

  const claimed: any[] = [];
  for (const c of candidates) {
    const { data, error } = await supabase
      .from("publish_queue")
      .update({
        status: "PROCESSING",
        locked_at: now,
        locked_by: "queue-processor",
        attempt_count: c.attempt_count + 1,
        last_attempt_at: now,
      })
      .eq("id", c.id)
      .in("status", ["PENDING", "RETRYING"])
      .select()
      .maybeSingle();
    if (data && !error) {
      claimed.push({ ...c, attempt_count: c.attempt_count + 1 });
      await logEvent(c.id, c.platform, c.video_id, "attempt_started", "PROCESSING", { attempt: c.attempt_count + 1 });
    }
  }
  return claimed;
}

async function invokeWorker(platform: Platform, platformPostId: string): Promise<{ ok: boolean; status: number; body: any }> {
  const fn = WORKER_FN[platform];
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ post_id: platformPostId, id: platformPostId, from_queue: true }),
    });
    const text = await r.text();
    let body: any = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { ok: r.ok && body?.ok !== false, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { message: String(e) } };
  }
}

async function moveToNeedsAttention(item: any, code: string, reason: string, extra: Record<string, unknown> = {}) {
  await supabase.from("publish_queue").update({
    status: "NEEDS_ATTENTION",
    last_error: reason,
    last_error_code: code,
    locked_at: null,
    locked_by: null,
  }).eq("id", item.id);
  await logEvent(item.id, item.platform, item.video_id, "moved_to_dlq", "NEEDS_ATTENTION", { code, reason, ...extra });
}

async function processOne(item: any) {
  const platform = item.platform as Platform;

  // Guard de arquivo antes de qualquer chamada externa
  const guard = await assetGuard(item);
  if (!guard.ok) {
    await moveToNeedsAttention(item, "ASSET_MISSING", guard.reason ?? "Arquivo indisponível.");
    return;
  }

  // Pré-flight de credencial ANTES de qualquer transferência do vídeo.
  // Conta inválida => nada é baixado/enviado (economia de egress).
  const accountBlocker = await checkAccountReady(supabase, platform, {
    projectId: item.project_id ?? null,
    accountRef: item.account_ref ?? null,
  });
  if (accountBlocker) {
    await moveToNeedsAttention(item, accountBlocker.code, accountBlocker.reason, {
      preflight: true,
      action: accountBlocker.action,
      download_skipped: true,
    });
    return;
  }

  const result = await invokeWorker(platform, item.platform_post_id);
  const diagnostics = extractApiDiagnostics(result.status, result.body);

  if (result.ok) {
    await supabase.from("publish_queue").update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      last_error: null,
      last_error_code: null,
      locked_at: null,
      locked_by: null,
    }).eq("id", item.id);
    await logEvent(item.id, platform, item.video_id, "published", "PUBLISHED", diagnostics);
    return;
  }

  // Usa o body cru da Meta quando disponível para classificação precisa
  const errorBody = result.body?.meta_error ?? result.body?.error ?? result.body;
  const cls = classifyPublishError(platform, result.status, errorBody, result.body?.error?.message ?? "Falha na publicação");
  // attempt_count já foi incrementado no claim; se atingiu o teto, é a última tentativa
  const isTerminalRetry = item.attempt_count >= item.max_attempts;

  if (cls.kind === "permanent" || isTerminalRetry) {
    const targetStatus = cls.kind === "permanent" ? "NEEDS_ATTENTION" : "NEEDS_ATTENTION"; // ambos vão para DLQ visual
    await supabase.from("publish_queue").update({
      status: targetStatus,
      last_error: cls.humanMessage,
      last_error_code: cls.code,
      locked_at: null,
      locked_by: null,
    }).eq("id", item.id);
    await logEvent(item.id, platform, item.video_id, "moved_to_dlq", targetStatus, {
      ...diagnostics,
      classified_code: cls.code,
      classified_message: cls.message,
      action: cls.action,
      attempt: item.attempt_count,
      max_attempts: item.max_attempts,
    });
  } else {
    const next = nextAttemptAt(item.attempt_count).toISOString();
    await supabase.from("publish_queue").update({
      status: "RETRYING",
      last_error: cls.humanMessage,
      last_error_code: cls.code,
      next_attempt_at: next,
      locked_at: null,
      locked_by: null,
    }).eq("id", item.id);
    await logEvent(item.id, platform, item.video_id, "retry_scheduled", "RETRYING", {
      ...diagnostics,
      classified_code: cls.code,
      classified_message: cls.message,
      next_attempt_at: next,
      attempt: item.attempt_count,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await releaseStaleLocks();
    const batch = await claimBatch();
    await Promise.all(batch.map((item) => processOne(item).catch(async (e) => {
      await supabase.from("publish_queue").update({
        status: "RETRYING",
        last_error: `Erro interno: ${String(e)}`,
        next_attempt_at: nextAttemptAt(item.attempt_count).toISOString(),
        locked_at: null, locked_by: null,
      }).eq("id", item.id);
    })));
    return new Response(JSON.stringify({ ok: true, processed: batch.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

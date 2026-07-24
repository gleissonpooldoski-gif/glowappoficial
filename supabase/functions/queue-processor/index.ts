// Motor central: consome publish_queue (PENDING/RETRYING com next_attempt_at <= now)
// e delega para o worker da plataforma. Roda a cada minuto via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { classifyPublishError, nextAttemptAt, type Platform } from "../_shared/publish-errors.ts";

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

async function logEvent(queueId: string, platform: string, videoId: string | null, event: string, status: string, detail: Record<string, unknown>) {
  await supabase.from("publish_events").insert({
    target_id: queueId, video_id: videoId, platform, event, status, detail,
  });
}

async function releaseStaleLocks() {
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  await supabase
    .from("publish_queue")
    .update({ status: "RETRYING", locked_at: null, locked_by: null, next_attempt_at: new Date().toISOString() })
    .eq("status", "PROCESSING")
    .lt("locked_at", cutoff);
}

async function claimBatch(): Promise<any[]> {
  // Atomic claim: seleciona pendentes prontos, marca PROCESSING com lock
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
      .update({ status: "PROCESSING", locked_at: now, locked_by: "queue-processor", attempt_count: c.attempt_count + 1 })
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

async function processOne(item: any) {
  const platform = item.platform as Platform;
  const result = await invokeWorker(platform, item.platform_post_id);

  if (result.ok) {
    // O worker atualiza a tabela específica; sincronizamos a fila também.
    await supabase.from("publish_queue").update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      last_error: null,
      last_error_code: null,
      locked_at: null,
      locked_by: null,
    }).eq("id", item.id);
    await logEvent(item.id, platform, item.video_id, "published", "PUBLISHED", { status: result.status });
    return;
  }

  const cls = classifyPublishError(platform, result.status, result.body, "Falha na publicação");
  const isTerminalRetry = item.attempt_count >= item.max_attempts;

  if (cls.kind === "permanent" || isTerminalRetry) {
    await supabase.from("publish_queue").update({
      status: cls.kind === "permanent" ? "NEEDS_ATTENTION" : "FAILED",
      last_error: cls.humanMessage,
      last_error_code: cls.code,
      locked_at: null,
      locked_by: null,
    }).eq("id", item.id);
    await logEvent(item.id, platform, item.video_id, "moved_to_dlq", cls.kind === "permanent" ? "NEEDS_ATTENTION" : "FAILED", { code: cls.code, message: cls.message, action: cls.action });
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
    await logEvent(item.id, platform, item.video_id, "retry_scheduled", "RETRYING", { code: cls.code, message: cls.message, next_attempt_at: next, attempt: item.attempt_count });
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

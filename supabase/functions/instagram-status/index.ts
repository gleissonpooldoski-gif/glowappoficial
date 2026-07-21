// Consulta e finaliza o status de uma publicação do Instagram.
// IMPORTANTE: esta função é uma verificação MANUAL secundária. Ela nunca deve
// disparar media_publish em paralelo ao worker principal (publish-instagram)
// nem marcar o post como ERRO enquanto o worker ainda está ativo. O worker
// principal detém locks em `instagram_publish_locks` (por creation_id) e
// `instagram_account_locks` (por ig_business_id) — enquanto qualquer um deles
// estiver ativo, esta função apenas reporta o status sem mutar o pipeline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v18.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
// Só considera "abandonado" após 10 minutos sem qualquer evolução — Reels
// longos (>60s / >50MB) podem levar de 2 a 5 minutos para FINISHED.
const ABANDONED_AFTER_MS = 10 * 60 * 1000;
// Lock do worker principal é considerado ativo se foi tocado nos últimos 8min.
const WORKER_LOCK_ACTIVE_MS = 8 * 60 * 1000;

function sanitizeToken(raw: string | undefined | null): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  return t.trim();
}

// Impede que URLs (ex.: signed video URL) sejam usadas como ID de recurso Graph API.
function assertGraphId(value: unknown, field: string): string {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) throw new Error(`[instagram-status] ${field} vazio ao montar URL Graph API.`);
  if (/^https?:\/\//i.test(raw) || raw.includes("/") || raw.includes("?") || raw.includes(" ")) {
    console.error(`[instagram-status] invalid_graph_id field=${field} value_preview=${raw.slice(0, 60)}`);
    throw new Error(`[instagram-status] ${field} inválido: recebeu URL/caminho em vez do ID numérico da Meta.`);
  }
  return raw;
}




function envCredentialsFor(account: string) {
  if (account === "resenha") {
    return {
      token: Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "",
      igId: Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "",
    };
  }
  if (account === "frame") {
    return {
      token: Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "",
      igId: Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "",
    };
  }
  return { token: "", igId: "" };
}

async function credentialsFor(supabase: any, account: string) {
  const { data } = await supabase
    .from("instagram_credentials")
    .select("access_token, ig_business_id")
    .eq("account", account)
    .maybeSingle();
  const env = envCredentialsFor(account);
  return {
    token: sanitizeToken(data?.access_token || env.token),
    igId: (data?.ig_business_id || env.igId || "").toString().trim(),
  };
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function metaErrorMessage(data: any, fallback: string) {
  const err = data?.error;
  if (!err) return fallback;
  return [err.message, err.type, err.code ? `code=${err.code}` : null, err.error_subcode ? `subcode=${err.error_subcode}` : null, err.fbtrace_id ? `trace=${err.fbtrace_id}` : null]
    .filter(Boolean)
    .join(" | ");
}

async function readMetaResponse(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { data, text };
}

async function metaGet(url: string) {
  const res = await fetch(url);
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    throw new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
  }
  return { status: res.status, data: payload.data };
}

async function metaPost(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    throw new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
  }
  return { status: res.status, data: payload.data };
}

// Verifica se o worker principal está processando esta publicação agora.
// Se sim, esta função manual NÃO deve disparar media_publish nem marcar ERRO.
async function isWorkerActive(supabase: any, creationId: string | null, igId: string | null) {
  const now = Date.now();
  if (creationId) {
    const { data: cLock } = await supabase
      .from("instagram_publish_locks")
      .select("status, polling_started_at, last_request_at")
      .eq("creation_id", creationId)
      .maybeSingle();
    if (cLock?.status === "processing") {
      const ref = new Date(cLock.last_request_at ?? cLock.polling_started_at).getTime();
      if (!Number.isNaN(ref) && now - ref < WORKER_LOCK_ACTIVE_MS) return true;
    }
  }
  if (igId) {
    const { data: aLock } = await supabase
      .from("instagram_account_locks")
      .select("post_id, locked_at, cooldown_until")
      .eq("ig_business_id", igId)
      .maybeSingle();
    if (aLock?.post_id) {
      const ref = new Date(aLock.locked_at).getTime();
      if (!Number.isNaN(ref) && now - ref < WORKER_LOCK_ACTIVE_MS) return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const appendLog = async (postId: string, entry: any) => {
    try {
      const { data } = await supabase.from("instagram_posts").select("logs").eq("id", postId).maybeSingle();
      const logs = Array.isArray(data?.logs) ? data!.logs : [];
      logs.push({ ts: new Date().toISOString(), ...entry });
      await supabase.from("instagram_posts").update({ logs }).eq("id", postId);
    } catch (_) { /* noop */ }
  };

  // Recarrega o post do banco e retorna true se já publicado (publish_id salvo).
  const isAlreadyPublished = async (postId: string) => {
    const { data } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", postId).maybeSingle();
    return { published: data?.status === "PUBLICADO" || !!data?.publish_id, publish_id: data?.publish_id ?? null };
  };

  let activePostId: string | null = null;

  const failPost = async (postId: string | null, message: string) => {
    if (!postId) return;
    const already = await isAlreadyPublished(postId);
    if (already.published) {
      await appendLog(postId, { event: "manual_error_ignored_already_published", message, publish_id: already.publish_id });
      return;
    }
    await supabase.from("instagram_posts").update({ status: "ERRO", error_message: message }).eq("id", postId);
    await appendLog(postId, { event: "manual_status_error", message });
  };

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const postId = body.postId ?? url.searchParams.get("postId");
    activePostId = postId;
    if (!postId) {
      return new Response(JSON.stringify({ error: "postId é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: post, error } = await supabase
      .from("instagram_posts")
      .select("id, account, container_id, publish_id, status, created_at")
      .eq("id", postId)
      .maybeSingle();
    if (error) throw error;
    if (!post) throw new Error("Publicação não encontrada.");

    // 🔒 Idempotência: se já publicado, retorna imediatamente sem consultar Meta.
    if (post.status === "PUBLICADO" && post.publish_id) {
      await appendLog(post.id, { event: "manual_status_short_circuit_already_published", publish_id: post.publish_id });
      return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: post.publish_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { token, igId } = await credentialsFor(supabase, post.account);
    if (!token || !igId) throw new Error(`Credenciais Meta ausentes para a conta '${post.account}'.`);

    // 🚦 Se o worker principal está ativo, apenas reporta status — nunca dispara publish
    // nem marca ERRO (evita a corrida que causou o code=1 duplicado).
    const workerActive = await isWorkerActive(supabase, post.container_id, igId);
    if (workerActive) {
      await appendLog(post.id, { event: "manual_status_skipped_worker_active", container_id: post.container_id, ig_business_id: igId });
      return new Response(JSON.stringify({ success: true, status: post.status ?? "PUBLICANDO", worker_active: true, message: "Worker principal em execução. Aguarde a finalização automática." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!post.container_id) {
      const ageMs = Date.now() - new Date(post.created_at).getTime();
      if (ageMs > ABANDONED_AFTER_MS) {
        const message = `Timeout de ${Math.round(ABANDONED_AFTER_MS/60000)} minutos: publicação ficou em PUBLICANDO sem creation_id/container_id salvo.`;
        await failPost(post.id, message);
        return new Response(JSON.stringify({ success: false, status: "ERRO", error: message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, status: post.status ?? "PUBLICANDO", message: "Aguardando criação do container." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const statusRes = await metaGet(`${FB_BASE}/${post.container_id}?fields=id,status_code&access_token=${encodeURIComponent(token)}`);
    const statusCode = statusRes.data?.status_code ?? "UNKNOWN";
    await appendLog(post.id, { event: "manual_container_status_response", status_code: statusCode, response: statusRes.data });

    const ageMs = Date.now() - new Date(post.created_at).getTime();
    if (statusCode === "FINISHED") {
      // 🔒 Re-verificação forte antes de disparar media_publish: se o worker publicou
      // enquanto processávamos, ou se há lock ativo, aborta.
      const already = await isAlreadyPublished(post.id);
      if (already.published) {
        await appendLog(post.id, { event: "manual_publish_skipped_already_published", publish_id: already.publish_id });
        return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: already.publish_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (await isWorkerActive(supabase, post.container_id, igId)) {
        await appendLog(post.id, { event: "manual_publish_skipped_worker_active", container_id: post.container_id });
        return new Response(JSON.stringify({ success: true, status: post.status ?? "PUBLICANDO", worker_active: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const publishRes = await metaPost(
        `${FB_BASE}/${igId}/media_publish`,
        { creation_id: post.container_id, access_token: token },
      );
      const publishId = publishRes.data?.id;
      await appendLog(post.id, { event: "manual_media_publish_response", status: publishRes.status, response: publishRes.data });
      if (!publishId) throw new Error(`Meta não retornou publish_id. Resposta: ${safeJson(publishRes.data)}`);

      const nowIso = new Date().toISOString();
      await supabase.from("instagram_posts").update({
        publish_id: publishId,
        status: "PUBLICADO",
        published_at: nowIso,
        error_message: null,
      }).eq("id", post.id);
      // Finaliza qualquer lock remanescente para impedir polling residual.
      try {
        await supabase.from("instagram_publish_locks").update({ status: "done" }).eq("creation_id", post.container_id);
        await supabase.from("instagram_account_locks").delete().eq("ig_business_id", igId).eq("post_id", post.id);
      } catch (_) { /* noop */ }
      await appendLog(post.id, { event: "manual_publish_completed", publish_id: publishId, published_at: nowIso });
      return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: publishId, data: publishRes.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ERRO / EXPIRED / abandono: só marca falha se o worker não está ativo E o
    // post está velho o suficiente para não estar em processamento normal.
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      const message = `Container não finalizou: ${statusCode}. Motivo Meta: ${statusRes.data?.status ?? safeJson(statusRes.data)}`;
      await failPost(post.id, message);
      return new Response(JSON.stringify({ success: false, status: "ERRO", error: message, data: statusRes.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (ageMs > ABANDONED_AFTER_MS) {
      const message = `Timeout de ${Math.round(ABANDONED_AFTER_MS/60000)} minutos aguardando FINISHED. Último status Meta: ${safeJson(statusRes.data)}`;
      await failPost(post.id, message);
      return new Response(JSON.stringify({ success: false, status: "ERRO", error: message, data: statusRes.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, status: "PUBLICANDO", data: statusRes.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[instagram-status]", e?.message);
    // Antes de marcar ERRO por exceção, re-checar publicação e worker.
    if (activePostId) {
      const already = await isAlreadyPublished(activePostId);
      if (already.published) {
        await appendLog(activePostId, { event: "manual_error_ignored_already_published", message: e?.message ?? "Erro desconhecido.", publish_id: already.publish_id });
        return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: already.publish_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    await failPost(activePostId, e?.message ?? "Erro desconhecido.");
    return new Response(JSON.stringify({ error: e?.message ?? "Erro desconhecido.", status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Consulta e finaliza o status de uma publicação do Instagram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v18.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function sanitizeToken(raw: string | undefined | null): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  return t.trim();
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

  let activePostId: string | null = null;

  const failPost = async (postId: string | null, message: string) => {
    if (!postId) return;
    const { data: current } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", postId).maybeSingle();
    if (current?.status === "PUBLICADO" || current?.publish_id) {
      await appendLog(postId, { event: "manual_error_ignored_already_published", message });
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

    const { token, igId } = await credentialsFor(supabase, post.account);
    if (!token || !igId) throw new Error(`Credenciais Meta ausentes para a conta '${post.account}'.`);

    if (post.status === "PUBLICADO" && post.publish_id) {
      const published = await metaGet(`${FB_BASE}/${post.publish_id}?fields=id,permalink&access_token=${encodeURIComponent(token)}`);
      await appendLog(post.id, { event: "published_status_response", response: published.data });
      return new Response(JSON.stringify({ success: true, status: "PUBLICADO", data: published.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!post.container_id) {
      const ageMs = Date.now() - new Date(post.created_at).getTime();
      if (ageMs > 5 * 60 * 1000) {
        const message = "Timeout de 5 minutos: publicação ficou em PUBLICANDO sem creation_id/container_id salvo.";
        await failPost(post.id, message);
        return new Response(JSON.stringify({ success: false, status: "ERRO", error: message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("Publicação ainda não possui creation_id/container_id salvo.");
    }

    const statusRes = await metaGet(`${FB_BASE}/${post.container_id}?fields=id,status_code&access_token=${encodeURIComponent(token)}`);
    const statusCode = statusRes.data?.status_code ?? "UNKNOWN";
    await appendLog(post.id, { event: "manual_container_status_response", status_code: statusCode, response: statusRes.data });

    const ageMs = Date.now() - new Date(post.created_at).getTime();
    if (statusCode === "FINISHED") {
      const { data: current } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", post.id).maybeSingle();
      if (current?.status === "PUBLICADO" || current?.publish_id) {
        await appendLog(post.id, { event: "manual_publish_skipped_already_published", publish_id: current.publish_id });
        return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: current.publish_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const publishRes = await metaPost(`${FB_BASE}/${igId}/media_publish`, {
        creation_id: post.container_id,
        access_token: token,
      });
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
      await appendLog(post.id, { event: "manual_publish_completed", publish_id: publishId, published_at: nowIso });
      return new Response(JSON.stringify({ success: true, status: "PUBLICADO", publish_id: publishId, data: publishRes.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED" || ageMs > 5 * 60 * 1000) {
      const message = statusCode === "ERROR" || statusCode === "EXPIRED"
        ? `Container não finalizou: ${statusCode}. Motivo Meta: ${statusRes.data?.status ?? safeJson(statusRes.data)}`
        : `Timeout de 5 minutos aguardando FINISHED. Último status Meta: ${safeJson(statusRes.data)}`;
      await supabase.from("instagram_posts").update({ status: "ERRO", error_message: message }).eq("id", post.id);
      await appendLog(post.id, { event: "manual_status_failed", message, response: statusRes.data });
      return new Response(JSON.stringify({ success: false, status: "ERRO", error: message, data: statusRes.data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, status: "PUBLICANDO", data: statusRes.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[instagram-status]", e?.message);
    await failPost(activePostId, e?.message ?? "Erro desconhecido.");
    return new Response(JSON.stringify({ error: e?.message ?? "Erro desconhecido.", status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
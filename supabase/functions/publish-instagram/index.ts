// Publica ou agenda Reels no Instagram via Graph API oficial (uso pessoal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
const BUCKET = "videos-processed";
const MAX_POLL_MS = 5 * 60 * 1000; // 5 minutos
const POLL_INTERVAL_MS = 5000;

type Account = "resenha" | "frame";

function tokensFor(account: Account) {
  if (account === "resenha") {
    return {
      token: Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "",
      igId: Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "",
    };
  }
  return {
    token: Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "",
    igId: Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "",
  };
}

function buildCaption(caption: string, hashtags: string) {
  const c = (caption ?? "").trim();
  const h = (hashtags ?? "").trim();
  if (!h) return c;
  if (!c) return h;
  return `${c}\n\n${h}`;
}

async function metaPost(url: string, body: Record<string, string>) {
  const form = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message ?? `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }
  return data;
}

async function metaGet(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message ?? `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }
  return data;
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

  try {
    const body = await req.json().catch(() => ({}));
    let {
      postId,
      account,
      videoId,
      caption = "",
      hashtags = "",
      publishNow = true,
      scheduledAt = null,
    } = body ?? {};

    // Carrega post existente se veio postId (fluxo do scheduler / retry).
    let post: any = null;
    if (postId) {
      const { data, error } = await supabase.from("instagram_posts").select("*").eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Publicação não encontrada.");
      post = data;
      account = account ?? data.account;
      videoId = videoId ?? data.video_id;
      caption = data.caption ?? caption;
      hashtags = data.hashtags ?? hashtags;
    }

    if (!account || !["resenha", "frame"].includes(account)) {
      return new Response(JSON.stringify({ error: "Conta inválida. Use 'resenha' ou 'frame'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!videoId) {
      return new Response(JSON.stringify({ error: "videoId é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Se agendamento no futuro e ainda não temos post: cria e retorna.
    if (!post && !publishNow && scheduledAt) {
      const when = new Date(scheduledAt);
      if (when.getTime() > Date.now() + 30_000) {
        const { data: video } = await supabase.from("videos").select("thumbnail_url").eq("id", videoId).maybeSingle();
        const { data: inserted, error } = await supabase.from("instagram_posts").insert({
          video_id: videoId,
          account,
          caption,
          hashtags,
          status: "AGENDADO",
          scheduled_at: when.toISOString(),
          thumbnail_url: video?.thumbnail_url ?? null,
          logs: [{ ts: new Date().toISOString(), event: "scheduled", scheduled_at: when.toISOString() }],
        }).select("*").single();
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, scheduled: true, post: inserted }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // horário já passou → publica agora.
    }

    // Cria post se ainda não existir (publicação imediata).
    if (!post) {
      const { data: video } = await supabase.from("videos").select("thumbnail_url").eq("id", videoId).maybeSingle();
      const { data: inserted, error } = await supabase.from("instagram_posts").insert({
        video_id: videoId,
        account,
        caption,
        hashtags,
        status: "PUBLICANDO",
        thumbnail_url: video?.thumbnail_url ?? null,
        logs: [{ ts: new Date().toISOString(), event: "publish_now_started" }],
      }).select("*").single();
      if (error) throw error;
      post = inserted;
    } else {
      await supabase.from("instagram_posts").update({
        status: "PUBLICANDO", error_message: null,
      }).eq("id", post.id);
      await appendLog(post.id, { event: "publish_started" });
    }

    // Gera URL assinada pública temporária do vídeo (bucket privado).
    const { data: videoRow, error: vErr } = await supabase
      .from("videos").select("processed_path, filename").eq("id", videoId).maybeSingle();
    if (vErr) throw vErr;
    if (!videoRow?.processed_path) throw new Error("Arquivo do vídeo não encontrado no armazenamento.");

    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(videoRow.processed_path, 60 * 60);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Falha ao gerar URL do vídeo.");

    await supabase.from("instagram_posts").update({ video_url: signed.signedUrl }).eq("id", post.id);

    const { token, igId } = tokensFor(account as Account);
    if (!token || !igId) throw new Error(`Credenciais Meta ausentes para a conta '${account}'.`);

    const fullCaption = buildCaption(caption, hashtags);

    // 1) Criar container.
    const containerUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igId}/media`;
    const containerRes = await metaPost(containerUrl, {
      media_type: "REELS",
      video_url: signed.signedUrl,
      caption: fullCaption,
      access_token: token,
    });
    const containerId = containerRes?.id;
    if (!containerId) throw new Error("Meta não retornou container_id.");
    await supabase.from("instagram_posts").update({ container_id: containerId }).eq("id", post.id);
    await appendLog(post.id, { event: "container_created", container_id: containerId });

    // 2) Poll até FINISHED.
    const start = Date.now();
    let statusCode = "";
    while (Date.now() - start < MAX_POLL_MS) {
      const statusUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
      const s = await metaGet(statusUrl);
      statusCode = s?.status_code ?? "";
      if (statusCode === "FINISHED") break;
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new Error(`Container falhou (status=${statusCode}): ${s?.status ?? ""}`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (statusCode !== "FINISHED") {
      throw new Error("Timeout aguardando processamento do vídeo pela Meta.");
    }
    await appendLog(post.id, { event: "container_finished" });

    // 3) Publicar.
    const publishUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igId}/media_publish`;
    const publishRes = await metaPost(publishUrl, {
      creation_id: containerId,
      access_token: token,
    });
    const publishId = publishRes?.id;
    if (!publishId) throw new Error("Meta não retornou publish_id.");

    const nowIso = new Date().toISOString();
    await supabase.from("instagram_posts").update({
      publish_id: publishId,
      status: "PUBLICADO",
      published_at: nowIso,
      error_message: null,
    }).eq("id", post.id);
    await appendLog(post.id, { event: "published", publish_id: publishId });

    return new Response(JSON.stringify({ success: true, publish_id: publishId, post_id: post.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const message = e?.message ?? "Erro desconhecido.";
    console.error("[publish-instagram]", message);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.postId) {
        await supabase.from("instagram_posts").update({
          status: "ERRO", error_message: message,
        }).eq("id", body.postId);
      }
    } catch (_) { /* noop */ }
    return new Response(JSON.stringify({ error: message, status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

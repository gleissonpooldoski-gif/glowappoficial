// Publica ou agenda Reels no Instagram via Graph API oficial (uso pessoal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
const BUCKET = "videos-processed";
const MAX_POLL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

type Account = "resenha" | "frame";

function envTokensFor(account: Account) {
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

async function tokensFor(supabase: any, account: Account) {
  const { data } = await supabase
    .from("instagram_credentials")
    .select("access_token, ig_business_id")
    .eq("account", account)
    .maybeSingle();
  const env = envTokensFor(account);
  return {
    token: data?.access_token || env.token,
    igId: data?.ig_business_id || env.igId,
  };
}

function buildCaption(caption: string, hashtags: string) {
  const c = (caption ?? "").trim();
  const h = (hashtags ?? "").trim();
  if (!h) return c;
  if (!c) return h;
  return `${c}\n\n${h}`;
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

const FRIENDLY_BLOCKED_MESSAGE =
  "Acesso bloqueado pela Meta. Verifique as permissões do seu aplicativo no painel do Facebook Developer ou reconecte a conta do Instagram.";

export function isApiBlockedError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  if (code === 200) return true;
  if (msg.includes("api access blocked")) return true;
  if (msg.includes("access blocked") && msg.includes("api")) return true;
  return false;
}

async function markCredentialsBlocked(supabase: any, account: Account, message: string) {
  try {
    await supabase.from("instagram_credentials").update({
      last_validated_at: new Date().toISOString(),
      last_validation_status: "API_BLOCKED",
      last_validation_detail: message,
    }).eq("account", account);
  } catch (_) { /* noop */ }
}

async function readMetaResponse(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { data, text };
}

async function metaPost(url: string, body: Record<string, string>) {
  const form = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    const err: any = new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
    err.metaData = payload.data;
    throw err;
  }
  return { status: res.status, data: payload.data };
}

async function metaGet(url: string) {
  const res = await fetch(url);
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    const err: any = new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
    err.metaData = payload.data;
    throw err;
  }
  return { status: res.status, data: payload.data };
}


async function checkPublicVideoUrl(videoUrl: string) {
  const res = await fetch(videoUrl, { headers: { Range: "bytes=0-0" } });
  await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "";
  const contentLength = res.headers.get("content-length") ?? "";
  const acceptRanges = res.headers.get("accept-ranges") ?? "";
  const contentRange = res.headers.get("content-range") ?? "";
  const ok = (res.status >= 200 && res.status < 300) || res.status === 206;
  return { ok, status: res.status, content_type: contentType, content_length: contentLength, accept_ranges: acceptRanges, content_range: contentRange };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  let activePostId: string | null = null;

  const appendLog = async (postId: string, entry: any) => {
    try {
      const { data } = await supabase.from("instagram_posts").select("logs").eq("id", postId).maybeSingle();
      const logs = Array.isArray(data?.logs) ? data!.logs : [];
      logs.push({ ts: new Date().toISOString(), ...entry });
      await supabase.from("instagram_posts").update({ logs }).eq("id", postId);
    } catch (_) { /* noop */ }
  };

  const failPost = async (postId: string | null, message: string, details?: any) => {
    if (!postId) return;
    const { data: current } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", postId).maybeSingle();
    if (current?.status === "PUBLICADO" || current?.publish_id) {
      await appendLog(postId, { event: "error_ignored_already_published", message, details: details ?? null });
      return;
    }
    const fullMessage = details ? `${message}\n${safeJson(details)}` : message;
    await supabase.from("instagram_posts").update({
      status: "ERRO",
      error_message: fullMessage,
    }).eq("id", postId);
    await appendLog(postId, { event: "error", message, details: details ?? null });
  };

  const completePublication = async (postId: string, containerId: string, token: string, igId: string) => {
    try {
      const start = Date.now();
      let lastStatus: any = null;
      while (Date.now() - start < MAX_POLL_MS) {
        const statusUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
        const statusRes = await metaGet(statusUrl);
        lastStatus = statusRes.data;
        const statusCode = statusRes.data?.status_code ?? "UNKNOWN";
        await appendLog(postId, { event: "container_status_response", elapsed_ms: Date.now() - start, status_code: statusCode, response: statusRes.data });

        if (statusCode === "FINISHED") break;
        if (statusCode === "ERROR" || statusCode === "EXPIRED") {
          throw new Error(`Container não finalizou: ${statusCode}. Motivo Meta: ${statusRes.data?.status ?? safeJson(statusRes.data)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (lastStatus?.status_code !== "FINISHED") {
        throw new Error(`Timeout de 5 minutos aguardando FINISHED. Último status Meta: ${safeJson(lastStatus)}`);
      }
      await appendLog(postId, { event: "container_finished", creation_id: containerId, response: lastStatus });

      const { data: current } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", postId).maybeSingle();
      if (current?.status === "PUBLICADO" || current?.publish_id) {
        await appendLog(postId, { event: "publish_skipped_already_published", publish_id: current.publish_id });
        return;
      }

      const publishUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igId}/media_publish`;
      const publishRes = await metaPost(publishUrl, {
        creation_id: containerId,
        access_token: token,
      });
      const publishId = publishRes.data?.id;
      await appendLog(postId, { event: "media_publish_response", status: publishRes.status, response: publishRes.data });
      if (!publishId) throw new Error(`Meta não retornou publish_id. Resposta: ${safeJson(publishRes.data)}`);

      const nowIso = new Date().toISOString();
      await supabase.from("instagram_posts").update({
        publish_id: publishId,
        status: "PUBLICADO",
        published_at: nowIso,
        error_message: null,
      }).eq("id", postId);
      await appendLog(postId, { event: "publish_id_saved", publish_id: publishId });
      await appendLog(postId, { event: "published", publish_id: publishId, published_at: nowIso });
    } catch (e: any) {
      const message = e?.message ?? "Erro desconhecido ao finalizar publicação.";
      console.error("[publish-instagram/background]", message);
      await failPost(postId, message, { error: e?.cause ?? null });
    }
  };

  try {
    body = await req.json().catch(() => ({}));
    let {
      postId,
      account,
      videoId,
      caption = "",
      hashtags = "",
      publishNow = true,
      scheduledAt = null,
    } = body ?? {};

    let post: any = null;
    if (postId) {
      const { data, error } = await supabase.from("instagram_posts").select("*").eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Publicação não encontrada.");
      post = data;
      activePostId = data.id;
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

    const { data: video, error: videoLookupError } = await supabase
      .from("videos")
      .select("processed_path, filename, thumbnail_url, duration_seconds, mime_type, size_bytes")
      .eq("id", videoId)
      .maybeSingle();
    if (videoLookupError) throw videoLookupError;

    if (!post && !publishNow && scheduledAt) {
      const when = new Date(scheduledAt);
      if (when.getTime() > Date.now() + 30_000) {
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
    }

    if (!post) {
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
      activePostId = inserted.id;
    } else {
      await supabase.from("instagram_posts").update({ status: "PUBLICANDO", error_message: null }).eq("id", post.id);
      await appendLog(post.id, { event: "publish_started" });
    }
    activePostId = post.id;

    if (!video?.processed_path) throw new Error("Arquivo do vídeo não encontrado no armazenamento.");

    const compatibility = {
      filename: video.filename,
      mime_type: video.mime_type,
      duration_seconds: video.duration_seconds,
      size_bytes: video.size_bytes,
      checks: {
        mp4_container: String(video.filename ?? "").toLowerCase().endsWith(".mp4") && String(video.mime_type ?? "video/mp4").startsWith("video/mp4"),
        reels_duration: Number(video.duration_seconds ?? 0) > 0 && Number(video.duration_seconds ?? 0) <= 900,
        expected_codec: "MP4/H.264 com áudio AAC quando exportado pelo editor",
      },
    };
    await appendLog(post.id, { event: "reels_compatibility_precheck", ...compatibility });
    if (!compatibility.checks.mp4_container) {
      throw new Error("Vídeo incompatível com Reels: use arquivo MP4 exportado pelo editor.");
    }

    const { data: signed, error: signedUrlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(video.processed_path, 60 * 60);
    if (signedUrlError || !signed?.signedUrl) throw new Error(signedUrlError?.message ?? "Falha ao gerar URL pública temporária do vídeo.");

    await supabase.from("instagram_posts").update({ video_url: signed.signedUrl }).eq("id", post.id);
    await appendLog(post.id, { event: "video_url_generated", bucket: BUCKET, path: video.processed_path, url: signed.signedUrl, expires_in_seconds: 3600 });

    const urlCheck = await checkPublicVideoUrl(signed.signedUrl);
    await appendLog(post.id, { event: "video_url_public_access_check", url: signed.signedUrl, ...urlCheck });
    if (!urlCheck.ok) {
      throw new Error(`URL pública do vídeo inacessível para a Meta (HTTP ${urlCheck.status}).`);
    }

    const { token, igId } = await tokensFor(supabase, account as Account);
    if (!token || !igId) throw new Error(`Credenciais Meta ausentes para a conta '${account}'.`);

    const accountCheckUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igId}?fields=id,username&access_token=${encodeURIComponent(token)}`;
    const accountCheck = await metaGet(accountCheckUrl);
    await appendLog(post.id, { event: "instagram_business_id_check", ig_id: igId, response: accountCheck.data });

    const permissionsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`;
    const permissionsCheck = await metaGet(permissionsUrl);
    const permissions = Array.isArray(permissionsCheck.data?.data) ? permissionsCheck.data.data : [];
    const contentPublishPermission = permissions.find((p: any) => p?.permission === "instagram_content_publish");
    await appendLog(post.id, { event: "access_token_permissions_check", has_instagram_content_publish: contentPublishPermission?.status === "granted", response: permissionsCheck.data });
    if (contentPublishPermission?.status !== "granted") {
      throw new Error("Access Token sem permissão instagram_content_publish concedida.");
    }

    const fullCaption = buildCaption(caption, hashtags);

    const containerUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igId}/media`;
    const containerRes = await metaPost(containerUrl, {
      media_type: "REELS",
      video_url: signed.signedUrl,
      caption: fullCaption,
      access_token: token,
    });
    const containerId = containerRes.data?.id;
    await appendLog(post.id, { event: "media_container_create_response", status: containerRes.status, response: containerRes.data });
    if (!containerId) throw new Error(`Meta não retornou creation_id. Resposta: ${safeJson(containerRes.data)}`);

    await supabase.from("instagram_posts").update({ container_id: containerId }).eq("id", post.id);
    await appendLog(post.id, { event: "creation_id_saved", creation_id: containerId });

    const background = completePublication(post.id, containerId, token, igId);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(background);

    return new Response(JSON.stringify({ success: true, accepted: true, creation_id: containerId, post_id: post.id, status: "PUBLICANDO" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const message = e?.message ?? "Erro desconhecido.";
    console.error("[publish-instagram]", message);
    await failPost(activePostId ?? body?.postId ?? null, message, { error: e?.cause ?? null });
    return new Response(JSON.stringify({ error: message, status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
// Publica ou agenda Reels no Instagram via Graph API oficial (uso pessoal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v18.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BUCKET = "videos-processed";
const MAX_POLL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

// Sanitiza o Access Token: trim + remove aspas simples/duplas do início/fim,
// mais limpeza de whitespace interno, BOM e caracteres de controle.
function sanitizeToken(raw: string | undefined | null): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  return t.trim();
}


type Account = string;

function envTokensFor(account: Account) {
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

async function tokensFor(supabase: any, account: Account) {
  const { data } = await supabase
    .from("instagram_credentials")
    .select("access_token, ig_business_id")
    .eq("account", account)
    .maybeSingle();
  const env = envTokensFor(account);
  const dbToken = data?.access_token ?? "";
  const source = dbToken ? "database" : (env.token ? "env_fallback" : "none");
  const token = sanitizeToken(dbToken || env.token);
  const igId = (data?.ig_business_id || env.igId || "").toString().trim();
  // Debug: mostra origem + primeiros 10 / últimos 10 caracteres do token de fato enviado à Meta.
  const head = token.slice(0, 10);
  const tail = token.slice(-10);
  console.log(`[publish-instagram] account=${account} token_source=${source} token_len=${token.length} token_head=${head} token_tail=${tail} ig_id=${igId}`);
  return { token, igId, tokenSource: source, tokenHead: head, tokenTail: tail };
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

function accountLabel(account?: string | null) {
  const key = String(account ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["oframefinal", "frame", "framefinal"].includes(key)) return "O FRAME FINAL";
  if (["sessaodaresenha", "resenha", "sessaodaresenhaoficial"].includes(key)) return "SESSÃO DA RESENHA";
  if (["segredodapromocao", "segredo", "segredodapromocaooficial"].includes(key)) return "SEGREDO DA PROMOÇÃO";
  return account ?? "conta selecionada";
}

function isSessionDaResenha(account?: string | null) {
  const key = String(account ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["sessaodaresenha", "resenha", "sessaodaresenhaoficial"].includes(key);
}

function isSegredoDaPromocao(account?: string | null) {
  const key = String(account ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["segredodapromocao", "segredo", "segredodapromocaooficial"].includes(key);
}

function isTokenExpiredError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  return Number(err?.code) === 190 || msg.includes("error validating access token") || msg.includes("token") && msg.includes("expired");
}

function isInstagramIdInvalidError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  return code === 100 || code === 803 || msg.includes("ig_id_invalid") || msg.includes("unsupported post request") || msg.includes("object with id") || msg.includes("does not exist");
}

function userFacingMetaError(account: string | null | undefined, rawMessage: string, metaData?: any): string {
  const label = accountLabel(account);
  if (isSessionDaResenha(account) && isTokenExpiredError(metaData, rawMessage)) {
    return `Token Meta expirado para ${label}. Recadastre o Access Token dessa conta em Configurações e tente publicar novamente.`;
  }
  if (isSegredoDaPromocao(account) && isInstagramIdInvalidError(metaData, rawMessage)) {
    return `IG_ID_INVALID para ${label}. Verifique se o instagram_business_account_id salvo no banco bate exatamente com o ID da conta de negócios da Meta vinculada a este token.`;
  }
  if (isTokenExpiredError(metaData, rawMessage)) {
    return `Token Meta expirado para ${label}. Recadastre o Access Token em Configurações e tente novamente.`;
  }
  if (isInstagramIdInvalidError(metaData, rawMessage)) {
    return `Instagram Business Account ID inválido para ${label}. Confirme que o ID cadastrado é o instagram_business_account_id exato da conta selecionada.`;
  }
  return rawMessage;
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
      connection_status: "ERROR",
    }).eq("account", account);
  } catch (_) { /* noop */ }
}

async function readMetaResponse(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { data, text };
}

async function metaPost(url: string, body: Record<string, string>, token?: string) {
  const form = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

async function metaGet(url: string, token?: string) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
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
      const statusUrl = `${FB_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
        const statusRes = await metaGet(statusUrl, token);
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

      const publishUrl = `${FB_BASE}/${igId}/media_publish`;
      const publishRes = await metaPost(publishUrl, {
        creation_id: containerId,
        access_token: token,
      }, token);

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
      const rawMessage = e?.message ?? "Erro desconhecido ao finalizar publicação.";
      const blocked = isApiBlockedError(e?.metaData, rawMessage);
      const message = blocked ? FRIENDLY_BLOCKED_MESSAGE : userFacingMetaError(undefined, rawMessage, e?.metaData);
      console.error("[publish-instagram/background]", rawMessage);
      await appendLog(postId, { event: "meta_api_error", blocked, raw_message: rawMessage, meta: e?.metaData ?? null });
      if (blocked) {
        try {
          const { data: cur } = await supabase.from("instagram_posts").select("account").eq("id", postId).maybeSingle();
          if (cur?.account) await markCredentialsBlocked(supabase, cur.account, rawMessage);
        } catch (_) { /* noop */ }
      }
      await failPost(postId, message, { raw: rawMessage, meta: e?.metaData ?? null });
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

    if (!account || typeof account !== "string") {
      return new Response(JSON.stringify({ error: "Conta inválida." }),
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

    const { token, igId, tokenSource, tokenHead, tokenTail } = await tokensFor(supabase, account as Account);
    await appendLog(post.id, { event: "meta_token_resolved", account, token_source: tokenSource, token_length: token.length, token_head: tokenHead, token_tail: tokenTail, ig_id: igId });
    if (!token || !igId) throw new Error(`Credenciais Meta ausentes para a conta '${account}'.`);

    // Sem pré-consultas legadas: o IG Business Account ID cadastrado é usado direto
    // no endpoint de container. Removidas chamadas a account_type e à Página do Facebook.
    const fullCaption = buildCaption(caption, hashtags);

    const containerUrl = `${FB_BASE}/${igId}/media`;
    const containerRes = await metaPost(containerUrl, {
      media_type: "REELS",
      video_url: signed.signedUrl,
      caption: fullCaption,
      access_token: token,
    }, token);
    const containerId = containerRes.data?.id;
    await appendLog(post.id, { event: "media_container_create_response", status: containerRes.status, endpoint: containerUrl, response: containerRes.data });
    if (!containerId) throw new Error(`Meta não retornou creation_id. Resposta: ${safeJson(containerRes.data)}`);


    await supabase.from("instagram_posts").update({ container_id: containerId }).eq("id", post.id);
    await appendLog(post.id, { event: "creation_id_saved", creation_id: containerId });

    const background = completePublication(post.id, containerId, token, igId);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(background);

    return new Response(JSON.stringify({ success: true, accepted: true, creation_id: containerId, post_id: post.id, status: "PUBLICANDO" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const rawMessage = e?.message ?? "Erro desconhecido.";
    const blocked = isApiBlockedError(e?.metaData, rawMessage);
    const message = blocked ? FRIENDLY_BLOCKED_MESSAGE : userFacingMetaError(body?.account, rawMessage, e?.metaData);
    console.error("[publish-instagram]", rawMessage);
    if (blocked && body?.account && typeof body.account === "string") {
      await markCredentialsBlocked(supabase, body.account as Account, rawMessage);
    }
    await failPost(activePostId ?? body?.postId ?? null, message, { raw: rawMessage, blocked, meta: e?.metaData ?? null });
    return new Response(JSON.stringify({ error: message, blocked, status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
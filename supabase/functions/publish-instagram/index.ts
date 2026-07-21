// Publica ou agenda Reels no Instagram via Graph API oficial (uso pessoal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v18.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BUCKET = "videos-processed";
// Rate-limit guard: NUNCA consultar em intervalo menor que 10s.
const INITIAL_POLL_DELAY_MS = 10000;      // Espera 10s após criar o container antes do primeiro GET.
const POLL_INTERVAL_MS = 10000;            // 10s entre consultas subsequentes.
const MAX_CONTAINER_STATUS_ATTEMPTS = 8;   // Máximo 8 consultas por container.
const PUBLISH_STABILIZATION_MS = 15000;    // Aguarda 15s após FINISHED antes do publish único.
const MAX_PUBLICATION_CYCLES = 3;
const CODE_4_COOLDOWN_MS = 5 * 60 * 1000;  // Cooldown de 5min após code=4.
const ACCOUNT_LOCK_STALE_MS = 15 * 60 * 1000; // Considera lock preso após 15min.

// Sanitiza o Access Token: trim + remove aspas, whitespace interno, BOM,
// caracteres de controle e QUALQUER caractere fora do intervalo ASCII imprimível
// (garante ByteString válido para uso em headers HTTP).
function sanitizeToken(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  t = t.replace(/[^\x21-\x7E]/g, "");
  return t.trim();
}

// Lança erro amigável se o token não for utilizável como ByteString.
function assertValidToken(token: string | null | undefined, account?: string | null) {
  if (token === null || token === undefined || token === "") {
    throw new Error(`Token inválido ou formato incorreto${account ? ` para '${account}'` : ""}.`);
  }
  if (!/^[\x21-\x7E]+$/.test(String(token))) {
    throw new Error(`Token inválido ou formato incorreto${account ? ` para '${account}'` : ""}. O token contém caracteres não suportados.`);
  }
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

function isCodeOneMetaError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  return code === 1 || msg.includes("oauthexception") && msg.includes("code=1");
}

function isReduceDataError(data: any, message?: string): boolean {
  const msg = `${data?.error?.message ?? ""} ${message ?? ""}`.toLowerCase();
  return msg.includes("please reduce") || msg.includes("reduce the amount of data");
}

function isAppRateLimitError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  if (code === 4 || code === 17 || code === 32 || code === 613) return true;
  if (msg.includes("application request limit reached")) return true;
  if (msg.includes("rate limit") || msg.includes("too many requests")) return true;
  return false;
}

function isMetaServiceError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  if (code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 341) return true;
  if (msg.includes("unknown error") || msg.includes("please reduce") || msg.includes("try again")) return true;
  return false;
}

function isPermissionError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const code = Number(err?.code);
  const sub = Number(err?.error_subcode);
  if (code === 10 || code === 200 || code === 294) return true;
  if (sub === 2207051) return true;
  if (msg.includes("permission") || msg.includes("scope") || msg.includes("not authorized")) return true;
  return false;
}

function isInvalidVideoError(data: any, message?: string): boolean {
  const err = data?.error;
  const msg = `${err?.message ?? ""} ${message ?? ""}`.toLowerCase();
  const sub = Number(err?.error_subcode);
  if (sub === 2207003 || sub === 2207004 || sub === 2207005 || sub === 2207006 || sub === 2207008 || sub === 2207010 || sub === 2207052) return true;
  if (msg.includes("media type") || msg.includes("video format") || msg.includes("aspect ratio") || msg.includes("duration") || msg.includes("codec") || msg.includes("invalid video")) return true;
  return false;
}

function userFacingMetaError(account: string | null | undefined, rawMessage: string, metaData?: any): string {
  const label = accountLabel(account);
  const code = metaData?.error?.code ?? "?";
  const trace = metaData?.error?.fbtrace_id ? ` (trace ${metaData.error.fbtrace_id})` : "";
  if (isSessionDaResenha(account) && isTokenExpiredError(metaData, rawMessage)) {
    return `Token Meta expirado para ${label}. Recadastre o Access Token dessa conta em Configurações e tente publicar novamente.`;
  }
  if (isSegredoDaPromocao(account) && isInstagramIdInvalidError(metaData, rawMessage)) {
    return `IG_ID_INVALID para ${label}. Verifique se o instagram_business_account_id salvo no banco bate exatamente com o ID da conta de negócios da Meta vinculada a este token.`;
  }
  if (isTokenExpiredError(metaData, rawMessage)) {
    return `Token Meta expirado para ${label}. Recadastre o Access Token em Configurações e tente novamente.`;
  }
  if (isPermissionError(metaData, rawMessage)) {
    return `Permissão insuficiente para publicar em ${label}. O token precisa dos escopos instagram_basic + instagram_content_publish. Reconecte a conta em Configurações.`;
  }
  if (isInvalidVideoError(metaData, rawMessage)) {
    return `Vídeo rejeitado pelo Instagram em ${label}. Verifique formato (MP4/H.264 + AAC), duração (3s a 15min) e proporção 9:16. Detalhe Meta: ${rawMessage}`;
  }
  if (isMetaServiceError(metaData, rawMessage)) {
    return `Erro Meta ao publicar em ${label} (code=${code})${trace}. A resposta da Meta foi salva nos logs da publicação. Tente novamente em alguns minutos se persistir.`;
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

async function markCredentialsValidationError(supabase: any, account: Account, status: "TOKEN_EXPIRED" | "IG_ID_INVALID", message: string) {
  try {
    await supabase.from("instagram_credentials").update({
      last_validated_at: new Date().toISOString(),
      last_validation_status: status,
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

function metaErrorDetails(data: any, fallbackMessage?: string) {
  const err = data?.error ?? {};
  return {
    message: err.message ?? fallbackMessage ?? null,
    type: err.type ?? null,
    code: err.code ?? null,
    fbtrace_id: err.fbtrace_id ?? null,
    error_subcode: err.error_subcode ?? null,
    raw: data ?? null,
  };
}

async function metaPost(url: string, body: Record<string, string>, token?: string, options?: { authHeaderToken?: string }) {
  if (token !== undefined) assertValidToken(token);
  if (options?.authHeaderToken !== undefined) assertValidToken(options.authHeaderToken);
  const form = new URLSearchParams(body);
  const endpoint = url.split("?")[0];
  const bodyKeys = Object.keys(body).filter((k) => k !== "access_token");
  console.log(`[publish-instagram] meta_request POST ${endpoint} body_keys=${bodyKeys.join(",")}`);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (options?.authHeaderToken) headers.Authorization = `Bearer ${options.authHeaderToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: form.toString(),
  });
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    if (isReduceDataError(payload.data, payload.text)) {
      console.error(`[publish-instagram] reduce_data_error endpoint=${endpoint} body_keys=${bodyKeys.join(",")} meta_message=${payload.data?.error?.message ?? ""}`);
    }
    const err: any = new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
    err.metaData = payload.data;
    err.endpoint = endpoint;
    err.bodyKeys = bodyKeys;
    throw err;
  }
  return { status: res.status, data: payload.data };
}

async function metaGet(url: string, token?: string) {
  if (token !== undefined) assertValidToken(token);
  const endpoint = url.split("?")[0];
  console.log(`[publish-instagram] meta_request GET ${endpoint}`);
  const res = await fetch(url);
  const payload = await readMetaResponse(res);
  if (!res.ok || payload.data?.error) {
    if (isReduceDataError(payload.data, payload.text)) {
      console.error(`[publish-instagram] reduce_data_error endpoint=${endpoint} method=GET meta_message=${payload.data?.error?.message ?? ""}`);
    }
    const err: any = new Error(metaErrorMessage(payload.data, `HTTP ${res.status}: ${payload.text.slice(0, 500)}`));
    err.metaData = payload.data;
    err.endpoint = endpoint;
    throw err;
  }
  return { status: res.status, data: payload.data };
}


async function checkPublicVideoUrl(videoUrl: string) {
  let method = "HEAD";
  let res = await fetch(videoUrl, { method });
  if (res.status === 405 || res.status === 403 || res.status === 400) {
    method = "GET";
    res = await fetch(videoUrl, { method, headers: { Range: "bytes=0-0" } });
    await res.arrayBuffer();
  }
  const contentType = res.headers.get("content-type") ?? "";
  const contentLength = res.headers.get("content-length") ?? "";
  const acceptRanges = res.headers.get("accept-ranges") ?? "";
  const contentRange = res.headers.get("content-range") ?? "";
  const statusOk = res.status === 200;
  const mp4Ok = contentType.toLowerCase().split(";")[0].trim() === "video/mp4";
  return { ok: statusOk && mp4Ok, method, status: res.status, content_type: contentType, content_length: contentLength, accept_ranges: acceptRanges, content_range: contentRange, status_ok: statusOk, mp4_ok: mp4Ok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  let activePostId: string | null = null;
  let activeAccount: string | null = null;
  let activeIgId: string | null = null;
  let activeCreationId: string | null = null;

  // ============ Rate-limit guard helpers ============
  const acquireAccountLock = async (igId: string, postId: string) => {
    // Verifica cooldown
    const { data: existing } = await supabase
      .from("instagram_account_locks")
      .select("*")
      .eq("ig_business_id", igId)
      .maybeSingle();
    const now = Date.now();
    if (existing?.cooldown_until && new Date(existing.cooldown_until).getTime() > now) {
      const secs = Math.ceil((new Date(existing.cooldown_until).getTime() - now) / 1000);
      return { ok: false, reason: "cooldown", cooldown_until: existing.cooldown_until, wait_seconds: secs };
    }
    if (existing?.post_id && existing.post_id !== postId) {
      const lockedAgeMs = now - new Date(existing.locked_at).getTime();
      if (lockedAgeMs < ACCOUNT_LOCK_STALE_MS) {
        return { ok: false, reason: "busy", busy_post_id: existing.post_id, locked_at: existing.locked_at };
      }
    }
    await supabase.from("instagram_account_locks").upsert({
      ig_business_id: igId,
      post_id: postId,
      locked_at: new Date().toISOString(),
      cooldown_until: null,
      last_error_code: null,
    }, { onConflict: "ig_business_id" });
    return { ok: true };
  };

  const releaseAccountLock = async (igId: string, postId: string) => {
    await supabase.from("instagram_account_locks").delete().eq("ig_business_id", igId).eq("post_id", postId);
  };

  const setAccountCooldown = async (igId: string, postId: string, ms: number, code: number) => {
    const until = new Date(Date.now() + ms).toISOString();
    await supabase.from("instagram_account_locks").upsert({
      ig_business_id: igId,
      post_id: postId,
      locked_at: new Date().toISOString(),
      cooldown_until: until,
      last_error_code: code,
    }, { onConflict: "ig_business_id" });
    return until;
  };

  const acquireContainerLock = async (creationId: string, postId: string, igId: string) => {
    const { data: existing } = await supabase
      .from("instagram_publish_locks")
      .select("*")
      .eq("creation_id", creationId)
      .maybeSingle();
    if (existing) {
      const ageMs = Date.now() - new Date(existing.polling_started_at).getTime();
      if (existing.status === "processing" && ageMs < 5 * 60 * 1000 && existing.post_id !== postId) {
        return { ok: false, reason: "already_polling", request_count: existing.request_count };
      }
    }
    await supabase.from("instagram_publish_locks").upsert({
      creation_id: creationId,
      post_id: postId,
      ig_business_id: igId,
      status: "processing",
      polling_started_at: new Date().toISOString(),
      request_count: 0,
      last_request_at: null,
    }, { onConflict: "creation_id" });
    return { ok: true };
  };

  const incrementContainerRequest = async (creationId: string) => {
    const { data } = await supabase.from("instagram_publish_locks").select("request_count").eq("creation_id", creationId).maybeSingle();
    const next = (data?.request_count ?? 0) + 1;
    await supabase.from("instagram_publish_locks").update({
      request_count: next,
      last_request_at: new Date().toISOString(),
    }).eq("creation_id", creationId);
    return next;
  };

  const finalizeContainerLock = async (creationId: string, status: "done" | "timeout" | "error") => {
    await supabase.from("instagram_publish_locks").update({ status }).eq("creation_id", creationId);
  };
  // ==================================================


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

  const completePublication = async (postId: string, initialContainerId: string, token: string, igId: string, account: Account, videoUrl: string, fullCaption: string, tokenSource: string) => {
    try {
      let containerId = initialContainerId;
      const publishUrl = `${FB_BASE}/${igId}/media_publish`;
      const containerUrl = `${FB_BASE}/${igId}/media`;

      const ensureNotAlreadyPublished = async (event = "publish_skipped_already_published") => {
        const { data: current } = await supabase.from("instagram_posts").select("status, publish_id").eq("id", postId).maybeSingle();
        if (current?.status === "PUBLICADO" || current?.publish_id) {
          await appendLog(postId, { event, publish_id: current.publish_id });
          return false;
        }
        return true;
      };

      // Polling controlado: aguarda INITIAL_POLL_DELAY_MS, depois consulta a cada POLL_INTERVAL_MS.
      // Máximo MAX_CONTAINER_STATUS_ATTEMPTS consultas. Nenhuma consulta extra em outro ponto.
      const waitForContainerFinished = async (cycle: number, currentContainerId: string) => {
        // Lock por creation_id: só um polling ativo.
        const lock = await acquireContainerLock(currentContainerId, postId, igId);
        if (!lock.ok) {
          await appendLog(postId, { event: "polling_skipped_lock_held", cycle, creation_id: currentContainerId, reason: lock.reason });
          throw new Error(`Polling já ativo para creation_id=${currentContainerId}.`);
        }

        // 1ª consulta: aguardar 10s após criar o container.
        await appendLog(postId, { event: "polling_initial_wait", cycle, creation_id: currentContainerId, wait_ms: INITIAL_POLL_DELAY_MS });
        await new Promise((resolve) => setTimeout(resolve, INITIAL_POLL_DELAY_MS));

        const startedAt = Date.now();
        let lastStatus: any = null;
        for (let attempt = 1; attempt <= MAX_CONTAINER_STATUS_ATTEMPTS; attempt++) {
          const requestTs = new Date().toISOString();
          const requestCount = await incrementContainerRequest(currentContainerId);
          const statusUrl = `${FB_BASE}/${currentContainerId}?fields=id,status_code&access_token=${encodeURIComponent(token)}`;
          let statusRes: any;
          try {
            statusRes = await metaGet(statusUrl, token);
          } catch (getErr: any) {
            if (isAppRateLimitError(getErr?.metaData, getErr?.message)) {
              const until = await setAccountCooldown(igId, postId, CODE_4_COOLDOWN_MS, 4);
              await appendLog(postId, {
                event: "rate_limit_code_4",
                stage: "container_status",
                cycle,
                creation_id: currentContainerId,
                attempt,
                request_count: requestCount,
                request_ts: requestTs,
                cooldown_until: until,
                meta_error: metaErrorDetails(getErr?.metaData, getErr?.message),
              });
              await finalizeContainerLock(currentContainerId, "error");
              const err: any = new Error("Application request limit reached (code=4). Cooldown de 5 minutos aplicado a esta conta.");
              err.metaData = getErr?.metaData;
              throw err;
            }
            throw getErr;
          }
          lastStatus = statusRes.data;
          const statusCode = statusRes.data?.status_code ?? "UNKNOWN";
          await appendLog(postId, {
            event: "container_status_response",
            cycle,
            creation_id: currentContainerId,
            attempt,
            max_attempts: MAX_CONTAINER_STATUS_ATTEMPTS,
            request_count: requestCount,
            request_ts: requestTs,
            elapsed_ms: Date.now() - startedAt,
            status_code: statusCode,
          });

          if (statusCode === "FINISHED") {
            const finishedAt = new Date().toISOString();
            await appendLog(postId, { event: "container_finished", cycle, creation_id: currentContainerId, finished_at: finishedAt, total_requests: requestCount });
            return { response: lastStatus, finishedAt };
          }
          if (statusCode === "ERROR" || statusCode === "EXPIRED") {
            await finalizeContainerLock(currentContainerId, "error");
            const reason = statusRes.data?.status ?? safeJson(statusRes.data);
            const err: any = new Error(`Container não processado (${statusCode}). Motivo Meta: ${reason}`);
            err.metaData = { error: { message: reason, type: "ContainerStatus", code: statusCode } };
            throw err;
          }
          if (attempt === MAX_CONTAINER_STATUS_ATTEMPTS) break;
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // Timeout — salva e aguarda.
        await finalizeContainerLock(currentContainerId, "timeout");
        await appendLog(postId, {
          event: "container_polling_timeout",
          cycle,
          creation_id: currentContainerId,
          total_attempts: MAX_CONTAINER_STATUS_ATTEMPTS,
          total_wait_ms: Date.now() - startedAt,
          last_status: lastStatus?.status_code ?? null,
        });
        throw new Error(`Timeout aguardando FINISHED após ${MAX_CONTAINER_STATUS_ATTEMPTS} consultas (${(INITIAL_POLL_DELAY_MS + POLL_INTERVAL_MS * (MAX_CONTAINER_STATUS_ATTEMPTS - 1)) / 1000}s).`);
      };

      const createReplacementContainer = async (cycle: number) => {
        const createdAt = new Date().toISOString();
        await appendLog(postId, { event: "media_container_recreate_attempt", cycle, endpoint: containerUrl, ig_id: igId, instagram_business_id: igId, token_source: tokenSource, created_at: createdAt });
        const containerRes = await metaPost(containerUrl, {
          media_type: "REELS",
          video_url: videoUrl,
          caption: fullCaption,
          access_token: token,
        }, token);
        const nextContainerId = containerRes.data?.id;
        await appendLog(postId, { event: "media_container_recreate_response", cycle, status: containerRes.status, endpoint: containerUrl, response: containerRes.data });
        if (!nextContainerId) throw new Error(`Meta não retornou novo creation_id. Resposta: ${safeJson(containerRes.data)}`);
        activeCreationId = nextContainerId;
        await supabase.from("instagram_posts").update({ container_id: nextContainerId }).eq("id", postId);
        await appendLog(postId, {
          event: "creation_id_saved",
          cycle,
          creation_id: nextContainerId,
          created_at: createdAt,
        });
        return nextContainerId;
      };

      let lastPublishErr: any = null;
      for (let cycle = 1; cycle <= MAX_PUBLICATION_CYCLES; cycle++) {
        if (!(await ensureNotAlreadyPublished())) return;
        activeCreationId = containerId;
        await appendLog(postId, { event: "publication_cycle_started", cycle, max_cycles: MAX_PUBLICATION_CYCLES, creation_id: containerId, instagram_business_id: igId, token_source: tokenSource });

        const finished = await waitForContainerFinished(cycle, containerId);

        // Após FINISHED: espera 15s e publica UMA única vez. Sem pre-check GET adicional.
        await appendLog(postId, { event: "publish_stabilization_wait", cycle, creation_id: containerId, finished_at: finished.finishedAt, wait_ms: PUBLISH_STABILIZATION_MS });
        await new Promise((resolve) => setTimeout(resolve, PUBLISH_STABILIZATION_MS));

        if (!(await ensureNotAlreadyPublished())) {
          await finalizeContainerLock(containerId, "done");
          return;
        }

        const captionLength = fullCaption?.length ?? 0;
        const hashtagCount = (fullCaption?.match(/#\w+/g) ?? []).length;
        const publishRequestedAt = new Date().toISOString();
        try {
          await appendLog(postId, {
            event: "media_publish_attempt",
            cycle,
            endpoint: publishUrl,
            ig_user_id: igId,
            instagram_business_id: igId,
            token_source: tokenSource,
            creation_id: containerId,
            caption_length: captionLength,
            hashtag_count: hashtagCount,
            publish_requested_at: publishRequestedAt,
          });
          const publishRes = await metaPost(
            publishUrl,
            { creation_id: containerId },
            token,
            { authHeaderToken: token },
          );
          const publishResponseAt = new Date().toISOString();
          await appendLog(postId, { event: "media_publish_response", cycle, status: publishRes.status, publish_requested_at: publishRequestedAt, publish_response_at: publishResponseAt, response: publishRes.data });
          const publishId = publishRes.data?.id;
          if (!publishId) throw new Error(`Meta não retornou publish_id. Resposta: ${safeJson(publishRes.data)}`);

          const nowIso = new Date().toISOString();
          await supabase.from("instagram_posts").update({
            publish_id: publishId,
            status: "PUBLICADO",
            published_at: nowIso,
            error_message: null,
          }).eq("id", postId);
          await appendLog(postId, { event: "published", publish_id: publishId, published_at: nowIso });
          await finalizeContainerLock(containerId, "done");
          return;
        } catch (err: any) {
          lastPublishErr = err;
          err.stage = "media_publish";

          // Detecção de code=4: aplica cooldown de 5 min e ABORTA (não retenta imediatamente).
          if (isAppRateLimitError(err?.metaData, err?.message)) {
            const until = await setAccountCooldown(igId, postId, CODE_4_COOLDOWN_MS, 4);
            await appendLog(postId, {
              event: "rate_limit_code_4",
              stage: "media_publish",
              cycle,
              creation_id: containerId,
              instagram_business_id: igId,
              cooldown_until: until,
              publish_requested_at: publishRequestedAt,
              meta_error: metaErrorDetails(err?.metaData, err?.message),
            });
            await finalizeContainerLock(containerId, "error");
            throw err;
          }

          await appendLog(postId, {
            event: "media_publish_error",
            cycle,
            endpoint: publishUrl,
            ig_user_id: igId,
            instagram_business_id: igId,
            token_source: tokenSource,
            creation_id: containerId,
            caption_length: captionLength,
            hashtag_count: hashtagCount,
            publish_requested_at: publishRequestedAt,
            failed_at: new Date().toISOString(),
            next_action: cycle < MAX_PUBLICATION_CYCLES ? "create_new_container" : "fail_post",
            raw_message: err?.message ?? null,
            meta_error: metaErrorDetails(err?.metaData, err?.message),
          });

          await supabase.from("instagram_posts").update({
            error_message: `Falha no publish do Reel após container finalizado. creation_id=${containerId}; erro=${err?.message ?? "desconhecido"}`,
          }).eq("id", postId);

          await finalizeContainerLock(containerId, "error");
          if (cycle === MAX_PUBLICATION_CYCLES) throw err;
          if (!(await ensureNotAlreadyPublished("new_container_skipped_already_published"))) return;
          containerId = await createReplacementContainer(cycle + 1);
        }
      }
      throw lastPublishErr ?? new Error("Falha ao publicar mídia no Instagram.");
    } catch (e: any) {
      const rawMessage = e?.message ?? "Erro desconhecido ao finalizar publicação.";
      const blocked = isApiBlockedError(e?.metaData, rawMessage);
      const rateLimited = isAppRateLimitError(e?.metaData, rawMessage);
      const publishCodeOne = e?.stage === "media_publish" && isCodeOneMetaError(e?.metaData, rawMessage);
      const message = rateLimited
        ? "Limite de requisições da Meta atingido (code=4). Aguardando 5 minutos antes de tentar novamente."
        : publishCodeOne ? "Falha no publish do Reel após container finalizado." : (blocked ? FRIENDLY_BLOCKED_MESSAGE : userFacingMetaError(account, rawMessage, e?.metaData));
      console.error("[publish-instagram/background]", rawMessage);
      await appendLog(postId, { event: "meta_api_error", blocked, rate_limited: rateLimited, raw_message: rawMessage, meta: e?.metaData ?? null });
      await failPost(postId, message, { raw: rawMessage, meta: e?.metaData ?? null, stage: e?.stage ?? null });
    } finally {
      // Sempre libera o account lock (mantém cooldown se houver).
      try { await releaseAccountLock(igId, postId); } catch (_) { /* noop */ }
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
      activeAccount = account ?? null;
      videoId = videoId ?? data.video_id;
      caption = data.caption ?? caption;
      hashtags = data.hashtags ?? hashtags;
    }

    if (!account || typeof account !== "string") {
      return new Response(JSON.stringify({ error: "Conta inválida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    activeAccount = account;
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
      if (post.status === "PUBLICADO" || post.publish_id) {
        await appendLog(post.id, { event: "publish_request_skipped_already_published", publish_id: post.publish_id ?? null });
        return new Response(JSON.stringify({ success: true, already_published: true, post_id: post.id, publish_id: post.publish_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
    assertValidToken(token, account);

    // Sem pré-consultas legadas: o IG Business Account ID cadastrado é usado direto
    // no endpoint de container. Removidas chamadas a account_type e à Página do Facebook.
    const fullCaption = buildCaption(caption, hashtags);

    const containerUrl = `${FB_BASE}/${igId}/media`;
    const MAX_CONTAINER_ATTEMPTS = 3;
    let containerRes: any = null;
    let containerId: string | undefined;
    let lastContainerErr: any = null;
    for (let attempt = 1; attempt <= MAX_CONTAINER_ATTEMPTS; attempt++) {
      try {
        const containerCreatedAt = new Date().toISOString();
        await appendLog(post.id, { event: "media_container_create_attempt", attempt, endpoint: containerUrl, ig_id: igId, created_at: containerCreatedAt });
        containerRes = await metaPost(containerUrl, {
          media_type: "REELS",
          video_url: signed.signedUrl,
          caption: fullCaption,
          access_token: token,
        }, token);
        await appendLog(post.id, { event: "media_container_create_response", attempt, status: containerRes.status, endpoint: containerUrl, created_at: containerCreatedAt, response: containerRes.data });
        containerId = containerRes.data?.id;
        if (containerId) {
          containerRes.created_at = containerCreatedAt;
          lastContainerErr = null;
          break;
        }
        throw new Error(`Meta não retornou creation_id. Resposta: ${safeJson(containerRes.data)}`);
      } catch (err: any) {
        lastContainerErr = err;
        const retryable = isCodeOneMetaError(err?.metaData, err?.message);
        await appendLog(post.id, {
          event: "media_container_create_error",
          attempt,
          retryable_code_1: retryable,
          raw_message: err?.message ?? null,
          meta_error: metaErrorDetails(err?.metaData, err?.message),
        });
        if (!retryable || attempt === MAX_CONTAINER_ATTEMPTS) throw err;
        const backoffMs = 5000 * attempt;
        await appendLog(post.id, { event: "media_container_retry_wait", attempt, reason: "meta_code_1", backoff_ms: backoffMs });
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    if (!containerId) throw lastContainerErr ?? new Error("Falha ao criar container de mídia no Instagram.");



    await supabase.from("instagram_posts").update({ container_id: containerId }).eq("id", post.id);
    await appendLog(post.id, {
      event: "creation_id_saved",
      creation_id: containerId,
      created_at: containerRes?.created_at ?? new Date().toISOString(),
      video_url_sent: signed.signedUrl,
      container_response: containerRes?.data ?? null,
    });

    const background = completePublication(post.id, containerId, token, igId, account as Account, signed.signedUrl, fullCaption, tokenSource);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(background);

    return new Response(JSON.stringify({ success: true, accepted: true, creation_id: containerId, post_id: post.id, status: "PUBLICANDO" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const rawMessage = e?.message ?? "Erro desconhecido.";
    const blocked = isApiBlockedError(e?.metaData, rawMessage);
    const message = blocked ? FRIENDLY_BLOCKED_MESSAGE : userFacingMetaError(activeAccount ?? body?.account, rawMessage, e?.metaData);
    console.error("[publish-instagram]", rawMessage);
    await failPost(activePostId ?? body?.postId ?? null, message, { raw: rawMessage, blocked, meta: e?.metaData ?? null });
    return new Response(JSON.stringify({ error: message, blocked, status: "ERRO" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
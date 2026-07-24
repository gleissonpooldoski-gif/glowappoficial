// Publica vídeos em Páginas do Facebook via Meta Graph API (uso pessoal).
// Módulo independente: NÃO altera Instagram/YouTube.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;
const BUCKET = "videos-processed";
const CAPTION_MAX_LENGTH = 63206;
const TOKEN_EXPIRED_MESSAGE = "Token Facebook expirado. Reconecte a Página.";
const INVALID_FACEBOOK_CONNECTION_MESSAGE = "Facebook não conectado ou token expirado. Reconecte sua Página antes de agendar.";

function sanitizeToken(raw: string | undefined | null): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  t = t.replace(/[^\x21-\x7E]/g, "");
  return t.trim();
}

async function readMeta(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, text };
}

function metaErrorMessage(data: any, fallback: string) {
  const err = data?.error;
  if (!err) return fallback;
  return [err.message, err.type, err.code ? `code=${err.code}` : null,
          err.error_subcode ? `subcode=${err.error_subcode}` : null,
          err.fbtrace_id ? `trace=${err.fbtrace_id}` : null]
    .filter(Boolean).join(" | ");
}

function isTransient(data: any): boolean {
  const err = data?.error;
  if (!err) return false;
  const code = Number(err.code);
  if (err.is_transient === true) return true;
  if ([1, 2, 4, 17, 32, 341, 613].includes(code)) return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("try again") || msg.includes("temporarily") || msg.includes("rate limit");
}

function isTokenExpired(data: any): boolean {
  const err = data?.error;
  const msg = String(err?.message ?? "").toLowerCase();
  return Number(err?.code) === 190 || (msg.includes("token") && msg.includes("expir"));
}

async function markFacebookConnectionExpired(supabase: any, accountId: string | null, message = TOKEN_EXPIRED_MESSAGE) {
  if (!accountId) return;
  const { error } = await supabase
    .from("facebook_accounts")
    .update({
      connection_status: "expired",
      token_checked_at: new Date().toISOString(),
      token_error: message,
    })
    .eq("id", accountId);
  if (error) console.error("[FACEBOOK PUBLISH] failed to mark connection expired", { account_id: accountId, error: error.message });
}

async function markFacebookConnectionConnected(supabase: any, accountId: string | null) {
  if (!accountId) return;
  const { error } = await supabase
    .from("facebook_accounts")
    .update({
      connection_status: "connected",
      token_checked_at: new Date().toISOString(),
      token_error: null,
    })
    .eq("id", accountId);
  if (error) console.error("[FACEBOOK PUBLISH] failed to mark connection connected", { account_id: accountId, error: error.message });
}

async function validateFacebookAccount(
  supabase: any,
  args: { projectId: string | null; scheduledAt?: string | null },
): Promise<{ ok: boolean; account: any | null; token: string; tokenFound: boolean; tokenValid: boolean; message?: string; meta?: any }> {
  if (!args.projectId) {
    return { ok: false, account: null, token: "", tokenFound: false, tokenValid: false, message: "Projeto do Facebook não encontrado." };
  }

  const { data: acc, error } = await supabase
    .from("facebook_accounts")
    .select("id, project_id, page_id, page_name, page_access_token, connection_status")
    .eq("project_id", args.projectId)
    .maybeSingle();
  if (error) throw error;

  const pageId = String((acc as any)?.page_id ?? "").trim();
  const pageToken = sanitizeToken((acc as any)?.page_access_token);
  const tokenFound = Boolean(pageToken);

  if (!acc || !pageId || !pageToken) {
    if ((acc as any)?.id) await markFacebookConnectionExpired(supabase, (acc as any).id, TOKEN_EXPIRED_MESSAGE);
    console.info("[FACEBOOK PUBLISH]", {
      Projeto: args.projectId,
      Página: pageId || null,
      "Token encontrado": tokenFound ? "SIM" : "NÃO",
      "Token válido": "NÃO",
      Horário: args.scheduledAt ?? null,
      Resultado: `ERRO: ${INVALID_FACEBOOK_CONNECTION_MESSAGE}`,
    });
    return { ok: false, account: acc ?? null, token: "", tokenFound, tokenValid: false, message: INVALID_FACEBOOK_CONNECTION_MESSAGE };
  }

  const validationUrl = `${GRAPH}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(validationUrl);
  const { data, status } = await readMeta(res);
  const tokenExpired = isTokenExpired(data);
  const tokenValid = res.ok && !data?.error && String(data?.id ?? "") === pageId;
  if (!tokenValid) {
    const message = tokenExpired ? TOKEN_EXPIRED_MESSAGE : metaErrorMessage(data, INVALID_FACEBOOK_CONNECTION_MESSAGE);
    if (tokenExpired) await markFacebookConnectionExpired(supabase, (acc as any).id, message);
    console.info("[FACEBOOK PUBLISH]", {
      Projeto: args.projectId,
      Página: pageId,
      "Token encontrado": "SIM",
      "Token válido": "NÃO",
      Horário: args.scheduledAt ?? null,
      Resultado: `ERRO: ${message}`,
      http_status: status,
    });
    return { ok: false, account: acc, token: pageToken, tokenFound: true, tokenValid: false, message, meta: data };
  }

  await markFacebookConnectionConnected(supabase, (acc as any).id);
  console.info("[FACEBOOK PUBLISH]", {
    Projeto: args.projectId,
    Página: pageId,
    "Token encontrado": "SIM",
    "Token válido": "SIM",
    Horário: args.scheduledAt ?? null,
    Resultado: "VALIDADO",
  });
  return { ok: true, account: acc, token: pageToken, tokenFound: true, tokenValid: true };
}

const RETRY_DELAYS_MS = [30_000, 120_000];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const appendLog = async (postId: string, event: string, detail: Record<string, unknown> = {}) => {
    try {
      const { data } = await supabase.from("facebook_posts").select("logs").eq("id", postId).maybeSingle();
      const logs = Array.isArray((data as any)?.logs) ? (data as any).logs : [];
      logs.push({ at: new Date().toISOString(), event, ...detail });
      await supabase.from("facebook_posts").update({ logs }).eq("id", postId);
    } catch (_) { /* noop */ }
  };

  const updateFacebookPost = async (postId: string, patch: Record<string, unknown>, event: string) => {
    const { data, error } = await supabase
      .from("facebook_posts")
      .update(patch)
      .eq("id", postId)
      .select("id, status, fb_video_id, published_at, updated_at")
      .maybeSingle();
    if (error) {
      console.error("[publish-facebook] facebook_posts update failed", {
        event,
        post_id: postId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    if (!data) {
      const message = `facebook_posts update returned no row (${event})`;
      console.error("[publish-facebook] facebook_posts update missing row", { event, post_id: postId });
      throw new Error(message);
    }
    console.log("[publish-facebook] facebook_posts update ok", {
      event,
      post_id: postId,
      status: (data as any).status,
      fb_video_id: (data as any).fb_video_id,
      published_at: (data as any).published_at,
    });
    return data;
  };

  const setError = async (postId: string, message: string, metaResponse?: any) => {
    await updateFacebookPost(postId, {
      status: "ERRO",
      error_message: message,
      meta_response: metaResponse ?? null,
    }, "facebook_publish_error");
    await appendLog(postId, "facebook_publish_error", { message, meta: metaResponse ?? null });
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "publish";

    // === CREATE: cria um facebook_post (agendado ou imediato) ===
    if (action === "create") {
      const project_id: string = body.project_id;
      const video_id: string = body.video_id;
      const description: string = String(body.description ?? "").slice(0, CAPTION_MAX_LENGTH);
      const scheduled_at: string | null = body.scheduled_at ?? null;
      const publish_now: boolean = !!body.publish_now;
      if (!project_id) return json({ error: "project_id é obrigatório." }, 400);
      if (!video_id) return json({ error: "video_id é obrigatório." }, 400);

      let acc: any = null;
      if (!publish_now) {
        const tokenCheck = await validateFacebookAccount(supabase, { projectId: project_id, scheduledAt: scheduled_at });
        if (!tokenCheck.ok) return json({ error: INVALID_FACEBOOK_CONNECTION_MESSAGE, detail: tokenCheck.message, meta: tokenCheck.meta ?? null }, 400);
        acc = tokenCheck.account;
      } else {
        const { data: currentAcc, error: accErr } = await supabase
          .from("facebook_accounts")
          .select("id, page_id, page_name, page_access_token")
          .eq("project_id", project_id)
          .maybeSingle();
        if (accErr) throw accErr;
        if (!currentAcc) return json({ error: "Nenhuma Página do Facebook vinculada a este projeto. Conecte em Configurações." }, 400);
        acc = currentAcc;
      }

      console.info("[FACEBOOK PUBLISH] create", {
        Projeto: project_id,
        Página: (acc as any).page_id,
        "Token encontrado": sanitizeToken((acc as any).page_access_token) ? "SIM" : "NÃO",
        "Token válido": publish_now ? "NÃO VALIDADO NO CREATE IMEDIATO" : "SIM",
        Horário: scheduled_at,
        Resultado: "AGENDAMENTO_VALIDADO",
      });

      const { data: post, error: insErr } = await supabase.from("facebook_posts").insert({
        project_id,
        facebook_account_id: (acc as any).id,
        page_id: (acc as any).page_id,
        page_name: (acc as any).page_name,
        video_id,
        description,
        status: publish_now ? "PUBLICANDO" : "AGENDADO",
        scheduled_at,
        logs: [{ at: new Date().toISOString(), event: "facebook_created", scheduled_at, publish_now }],
      }).select("id").maybeSingle();
      if (insErr) {
        console.error("FACEBOOK ERROR", { step: "insert_facebook_posts", error: insErr });
        throw insErr;
      }

      const { data: target, error: targetErr } = await supabase
        .from("publish_targets")
        .select("id, platform, status, facebook_post_id")
        .eq("facebook_post_id", (post as any)?.id)
        .maybeSingle();
      if (targetErr) console.error("FACEBOOK ERROR", { step: "trigger_check_publish_targets", error: targetErr });

      if (publish_now) {
        // dispara publicação assíncrona
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-facebook`;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ postId: (post as any)?.id }),
        }).catch(() => {});
      }

      return json({ success: true, post });
    }

    // === PUBLISH: executa uma publicação existente ===
    const postId: string = body.postId;
    if (!postId) return json({ error: "postId é obrigatório." }, 400);

    const { data: post, error: pErr } = await supabase
      .from("facebook_posts").select("*").eq("id", postId).maybeSingle();
    if (pErr) throw pErr;
    if (!post) return json({ error: "Publicação não encontrada." }, 404);

    // Validação 1: vídeo existente e URL assinada
    const { data: video } = await supabase
      .from("videos").select("id, project_id, processed_path, original_path")
      .eq("id", (post as any).video_id).maybeSingle();
    const projectId = (post as any).project_id ?? (video as any)?.project_id ?? null;

    // Validação 2: sempre busca a conexão ATUAL do projeto, nunca um token antigo do post.
    const accountCheck = await validateFacebookAccount(supabase, {
      projectId,
      scheduledAt: (post as any).scheduled_at ?? null,
    });
    if (!accountCheck.ok) {
      await setError(postId, accountCheck.message ?? TOKEN_EXPIRED_MESSAGE, accountCheck.meta ?? null);
      return json({ success: false, error: accountCheck.message ?? TOKEN_EXPIRED_MESSAGE, meta: accountCheck.meta ?? null }, 200);
    }
    const acc = accountCheck.account;
    const pageToken = accountCheck.token;
    const pageId = String((acc as any).page_id).trim();

    const path = (video as any)?.processed_path || (video as any)?.original_path;
    if (!video || !path) {
      await setError(postId, "Arquivo do vídeo não encontrado no Storage.");
      return json({ error: "Vídeo não encontrado." }, 400);
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(path, 60 * 60);
    let videoUrl = signed?.signedUrl ?? null;
    if (!videoUrl) {
      // fallback bucket videos-original
      const { data: s2 } = await supabase.storage.from("videos-original").createSignedUrl(path, 60 * 60);
      videoUrl = s2?.signedUrl ?? null;
    }
    if (!videoUrl) {
      await setError(postId, "Falha ao gerar URL do vídeo para publicação.");
      return json({ error: "URL do vídeo inválida." }, 400);
    }

    await updateFacebookPost(postId, {
      status: "PUBLICANDO", video_url: videoUrl, error_message: null,
    }, "facebook_publish_started");
    await appendLog(postId, "facebook_publish_started", { page_id: pageId, page_name: (acc as any).page_name });

    const description = String((post as any).description ?? "");
    const scheduledAt = (post as any).scheduled_at as string | null;
    const startTs = Date.now();

    // Publica via Graph API — endpoint /{page-id}/videos com file_url.
    const attemptPublish = async (): Promise<{ ok: boolean; data: any; text: string; status: number }> => {
      const form = new URLSearchParams();
      form.set("access_token", pageToken);
      form.set("file_url", videoUrl!);
      if (description) form.set("description", description);
      // Agendamento nativo: Meta exige 10min–6meses no futuro.
      if (scheduledAt) {
        const ts = Math.floor(new Date(scheduledAt).getTime() / 1000);
        const minFuture = Math.floor(Date.now() / 1000) + 11 * 60;
        if (ts > minFuture) {
          form.set("published", "false");
          form.set("scheduled_publish_time", String(ts));
        }
      }
      const res = await fetch(`${GRAPH_VIDEO}/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const { data, text, status } = await readMeta(res);
      return { ok: res.ok && !data?.error, data, text, status };
    };

    let attemptNumber = 0;
    let lastResult: Awaited<ReturnType<typeof attemptPublish>> | null = null;
    const maxAttempts = 1 + RETRY_DELAYS_MS.length;
    for (attemptNumber = 0; attemptNumber < maxAttempts; attemptNumber++) {
      if (attemptNumber > 0) {
        const wait = RETRY_DELAYS_MS[attemptNumber - 1];
        await appendLog(postId, "facebook_publish_retry", { attempt: attemptNumber + 1, wait_ms: wait });
        await new Promise((r) => setTimeout(r, wait));
      }
      lastResult = await attemptPublish();
      await appendLog(postId, "facebook_publish_attempt", {
        attempt: attemptNumber + 1,
        status: lastResult.status,
        ok: lastResult.ok,
        meta: lastResult.data,
      });
      if (lastResult.ok) break;
      if (!isTransient(lastResult.data)) break;
    }

    if (!lastResult || !lastResult.ok) {
      const msg = metaErrorMessage(lastResult?.data, `HTTP ${lastResult?.status ?? "?"}: ${lastResult?.text?.slice(0, 400) ?? ""}`);
      if (isTokenExpired(lastResult?.data)) {
        await markFacebookConnectionExpired(supabase, (acc as any).id, TOKEN_EXPIRED_MESSAGE);
        await setError(postId, TOKEN_EXPIRED_MESSAGE, lastResult?.data ?? null);
        console.info("[FACEBOOK PUBLISH]", {
          Projeto: projectId,
          Página: pageId,
          "Token encontrado": "SIM",
          "Token válido": "NÃO",
          Horário: (post as any).scheduled_at ?? null,
          Resultado: `ERRO: ${TOKEN_EXPIRED_MESSAGE}`,
        });
        return json({ success: false, error: TOKEN_EXPIRED_MESSAGE, meta: lastResult?.data ?? null }, 200);
      }
      await setError(postId, msg, lastResult?.data ?? null);
      console.info("[FACEBOOK PUBLISH]", {
        Projeto: projectId,
        Página: pageId,
        "Token encontrado": "SIM",
        "Token válido": "SIM",
        Horário: (post as any).scheduled_at ?? null,
        Resultado: `ERRO: ${msg}`,
      });
      return json({ success: false, error: msg, meta: lastResult?.data ?? null }, 200);
    }

    const fbVideoId = String(lastResult.data?.id ?? "");
    const elapsedMs = Date.now() - startTs;
    console.info("[FACEBOOK PUBLISH]", {
      Projeto: projectId,
      Página: pageId,
      "Token encontrado": "SIM",
      "Token válido": "SIM",
      Horário: (post as any).scheduled_at ?? null,
      Resultado: "PUBLICADO",
    });
    console.log("[publish-facebook] meta publish success", {
      post_id: postId,
      page_id: pageId,
      fb_video_id: fbVideoId,
      elapsed_ms: elapsedMs,
      meta_keys: Object.keys(lastResult.data ?? {}),
    });
    await updateFacebookPost(postId, {
      status: "PUBLICADO",
      fb_video_id: fbVideoId,
      meta_response: lastResult.data,
      published_at: new Date().toISOString(),
      error_message: null,
    }, "facebook_published");
    await appendLog(postId, "facebook_published", {
      fb_video_id: fbVideoId, elapsed_ms: elapsedMs, page_id: pageId,
    });

    return json({ success: true, fb_video_id: fbVideoId, meta: lastResult.data });
  } catch (e: any) {
    console.error("FACEBOOK ERROR", { message: e?.message, stack: e?.stack, error: e });
    return json({ error: e?.message ?? "Erro inesperado." }, 500);
  }
});

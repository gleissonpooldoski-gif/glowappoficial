// Resolução de canal + garantia de access_token válido para o YouTube.
// Usado por youtube-upload e youtube-post-comment para que ambos falhem
// com a MESMA taxonomia de erro e nunca usem token expirado.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type YtErrorCode =
  | "CREDENTIAL_NOT_FOUND"
  | "CHANNEL_NOT_LINKED"
  | "REFRESH_TOKEN_MISSING"
  | "REFRESH_TOKEN_INVALID"
  | "TOKEN_REFRESH_FAILED"
  | "PERMISSION_DENIED"
  | "QUOTA_EXCEEDED"
  | "UPLOAD_FAILED"
  | "YOUTUBE_API_ERROR"
  | "ASSET_MISSING";

export class YtError extends Error {
  code: YtErrorCode;
  httpStatus: number;
  transient: boolean;
  detail?: unknown;
  constructor(code: YtErrorCode, message: string, opts?: { httpStatus?: number; transient?: boolean; detail?: unknown }) {
    super(message);
    this.code = code;
    this.httpStatus = opts?.httpStatus ?? 400;
    this.transient = opts?.transient ?? false;
    this.detail = opts?.detail;
  }
  toJSON() {
    return { error: this.message, code: this.code, transient: this.transient, detail: this.detail ?? null };
  }
}

const CRED_COLS =
  "id, account, channel_id, channel_title, project_id, access_token, refresh_token, expires_at, scope, status";

/**
 * Localiza a credencial do canal com fallbacks seguros e SEM cruzar projetos:
 *   1) account exato
 *   2) channel_id igual ao account informado
 *   3) canal vinculado ao project_id do vídeo (corrige contas legadas como "default"
 *      e canais trocados/reconectados que deixaram o account antigo no post)
 */
export async function resolveYoutubeCredential(
  supabase: any,
  opts: { account?: string | null; videoId?: string | null; projectId?: string | null },
): Promise<any> {
  const account = (opts.account ?? "").trim();

  if (account && account !== "default" && account !== "new") {
    const { data } = await supabase.from("youtube_credentials").select(CRED_COLS).eq("account", account).maybeSingle();
    if (data) return data;
    const { data: byChannel } = await supabase
      .from("youtube_credentials").select(CRED_COLS).eq("channel_id", account).maybeSingle();
    if (byChannel) return byChannel;
  }

  let projectId = opts.projectId ?? null;
  if (!projectId && opts.videoId) {
    const { data: video } = await supabase.from("videos").select("project_id").eq("id", opts.videoId).maybeSingle();
    projectId = video?.project_id ?? null;
  }

  if (projectId) {
    const { data: byProject } = await supabase
      .from("youtube_credentials").select(CRED_COLS).eq("project_id", projectId).maybeSingle();
    if (byProject) return byProject;
    throw new YtError(
      "CHANNEL_NOT_LINKED",
      `Nenhum canal do YouTube está vinculado a este projeto (conta informada: "${account || "—"}"). ` +
        `Vincule o canal ao projeto em Integrações → Canais do YouTube.`,
    );
  }

  throw new YtError(
    "CREDENTIAL_NOT_FOUND",
    `Credencial do YouTube inexistente para a conta "${account || "—"}" e o vídeo não possui projeto para resolver o canal. ` +
      `Reconecte o canal em Integrações.`,
  );
}

/** Garante um access_token válido; renova sempre que faltar menos de 5 min. */
export async function ensureAccessToken(
  supabase: any,
  cred: any,
  log?: (entry: Record<string, unknown>) => void,
): Promise<string> {
  const expiresAt = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  const stillValid = !!cred.access_token && expiresAt - Date.now() > 300_000;
  if (stillValid) {
    log?.({ step: "youtube_token_ok", account: cred.account, expires_at: cred.expires_at });
    return cred.access_token;
  }

  if (!cred.refresh_token) {
    await markCred(supabase, cred.account, "REFRESH_TOKEN_MISSING", "Sem refresh_token — reconecte o canal.");
    throw new YtError(
      "REFRESH_TOKEN_MISSING",
      `Canal "${cred.channel_title ?? cred.account}" sem refresh_token. Reconecte o canal em Integrações.`,
    );
  }

  log?.({ step: "youtube_token_refresh_started", account: cred.account, expired_at: cred.expires_at });

  const form = new URLSearchParams({
    client_id: (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim(),
    client_secret: (Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "").trim(),
    refresh_token: cred.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json: any = await res.json().catch(() => ({}));

  if (!res.ok || json.error) {
    const raw = String(json.error ?? "");
    const detail = String(json.error_description ?? raw ?? "Falha ao renovar token.");
    if (raw === "invalid_grant") {
      await markCred(supabase, cred.account, "REFRESH_TOKEN_INVALID", detail);
      throw new YtError(
        "REFRESH_TOKEN_INVALID",
        `Autorização do canal "${cred.channel_title ?? cred.account}" foi revogada ou expirou (invalid_grant). ` +
          `É necessário reconectar o canal em Integrações.`,
        { detail },
      );
    }
    await markCred(supabase, cred.account, "TOKEN_REFRESH_FAILED", detail);
    throw new YtError("TOKEN_REFRESH_FAILED", `Falha ao renovar o token do YouTube: ${detail}`, {
      transient: res.status >= 500,
      detail,
    });
  }

  const expires = json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null;
  await supabase.from("youtube_credentials").update({
    access_token: json.access_token,
    expires_at: expires,
    scope: json.scope ?? cred.scope,
    status: "connected",
    last_validated_at: new Date().toISOString(),
    last_validation_status: "VALID",
    last_validation_detail: "Token renovado automaticamente.",
  }).eq("account", cred.account);

  log?.({ step: "youtube_token_refreshed", account: cred.account, expires_at: expires });
  return json.access_token;
}

async function markCred(supabase: any, account: string, status: string, detail: string) {
  await supabase.from("youtube_credentials").update({
    status: "expired",
    last_validated_at: new Date().toISOString(),
    last_validation_status: status,
    last_validation_detail: String(detail).slice(0, 400),
  }).eq("account", account);
  await upsertYoutubeHealth(supabase, account, "expired", status, detail);
}

/** Espelha o estado do canal em connection_health (alimenta o sino de alertas). */
export async function upsertYoutubeHealth(
  supabase: any,
  account: string,
  status: "connected" | "expired" | "unknown",
  code: string | null,
  detail?: string | null,
  projectId?: string | null,
) {
  try {
    await supabase.from("connection_health").upsert({
      platform: "youtube",
      account_ref: account,
      project_id: projectId ?? null,
      status,
      last_check: new Date().toISOString(),
      error_code: code,
      error_reason: detail ? String(detail).slice(0, 400) : null,
    }, { onConflict: "platform,account_ref" });
  } catch { /* saúde é best-effort */ }
}

/** Marca o canal como bloqueado para upload (403 forbidden da API). */
export async function markUploadForbidden(supabase: any, cred: any, detail: string) {
  await supabase.from("youtube_credentials").update({
    status: "permission_denied",
    last_validated_at: new Date().toISOString(),
    last_validation_status: "PERMISSION_DENIED",
    last_validation_detail: String(detail).slice(0, 400),
  }).eq("account", cred.account);
  await upsertYoutubeHealth(supabase, cred.account, "expired", "PERMISSION_DENIED", detail, cred.project_id ?? null);
}


/** Traduz uma resposta de erro da API do YouTube para a taxonomia padrão. */
export function classifyYoutubeApiError(status: number, parsed: any, rawText: string): YtError {
  const apiMsg = parsed?.error?.message ?? (rawText || "").slice(0, 400);
  const reason = String(parsed?.error?.errors?.[0]?.reason ?? "").toLowerCase();

  if (status === 401) {
    return new YtError("REFRESH_TOKEN_INVALID", `Token rejeitado pelo YouTube (401): ${apiMsg}. Reconecte o canal.`, {
      httpStatus: 401, detail: parsed?.error ?? apiMsg,
    });
  }
  if (reason.includes("quota") || reason.includes("ratelimit") || reason.includes("userratelimit") || status === 429) {
    return new YtError("QUOTA_EXCEEDED", `Quota/limite de requisições do YouTube excedido: ${apiMsg}`, {
      httpStatus: 429, transient: true, detail: parsed?.error ?? apiMsg,
    });
  }
  if (status === 403) {
    return new YtError("PERMISSION_DENIED", `Permissão insuficiente no canal (403): ${apiMsg}`, {
      httpStatus: 403, detail: parsed?.error ?? apiMsg,
    });
  }
  if (status >= 500) {
    return new YtError("YOUTUBE_API_ERROR", `YouTube indisponível (${status}): ${apiMsg}`, {
      httpStatus: status, transient: true, detail: parsed?.error ?? apiMsg,
    });
  }
  return new YtError("YOUTUBE_API_ERROR", `Erro da API do YouTube (${status}): ${apiMsg}`, {
    httpStatus: status, detail: parsed?.error ?? apiMsg,
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

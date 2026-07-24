// Classificador de erros compartilhado entre workers de publicação.
// Distingue erros transitórios (retry) de permanentes (dead letter queue).

export type ErrorKind = "transient" | "permanent" | "unknown";
export type Platform = "instagram" | "facebook" | "youtube" | "tiktok";

export interface ClassifiedError {
  kind: ErrorKind;
  code: string;
  message: string;
  humanMessage: string;
  action?: "reconnect" | "reschedule" | "check_video" | "none";
}

const TOKEN_CODES = new Set(["190", "OAuthException", "401", "403", "invalid_grant", "invalid_token"]);
const PERMISSION_CODES = new Set(["200", "10", "803", "294", "permissions"]);
const TRANSIENT_META_CODES = new Set(["1", "2", "4", "17", "32", "341", "368", "613"]);
const VIDEO_INVALID_CODES = new Set(["100", "352", "356", "3502"]);
const DUPLICATE_CODES = new Set(["506", "1610302"]);

export function classifyPublishError(
  platform: Platform,
  status: number,
  body: unknown,
  fallbackMessage = "",
): ClassifiedError {
  const raw = typeof body === "string" ? safeParse(body) : (body ?? {});
  const errObj = (raw as any)?.error ?? raw ?? {};
  const code = String(
    errObj.code ?? errObj.error_code ?? errObj.type ?? errObj.status ?? status ?? "unknown",
  );
  const subcode = errObj.error_subcode ? String(errObj.error_subcode) : undefined;
  const message = String(
    errObj.message ?? errObj.error_description ?? errObj.description ?? fallbackMessage ?? "Erro desconhecido",
  );

  // Token / auth errors → permanent, needs reconnect
  if (
    TOKEN_CODES.has(code) ||
    /oauth|token|access[_ ]?token|invalid[_ ]?grant|expired/i.test(message) ||
    status === 401
  ) {
    return {
      kind: "permanent",
      code: `TOKEN_EXPIRED:${code}`,
      message,
      humanMessage: `Token do ${platformLabel(platform)} expirou. Reconecte a conta em Configurações → Integrações.`,
      action: "reconnect",
    };
  }

  // Permission errors → permanent, needs reconnect with proper scopes
  if (PERMISSION_CODES.has(code) || status === 403) {
    return {
      kind: "permanent",
      code: `PERMISSION_DENIED:${code}`,
      message,
      humanMessage: `${platformLabel(platform)} recusou por permissão insuficiente. Reconecte a conta autorizando todos os escopos.`,
      action: "reconnect",
    };
  }

  // Video invalid → permanent, needs re-render or check
  if (VIDEO_INVALID_CODES.has(code) || /video|format|duration|codec|unsupported/i.test(message)) {
    return {
      kind: "permanent",
      code: `VIDEO_INVALID:${code}`,
      message,
      humanMessage: `${platformLabel(platform)} rejeitou o vídeo (formato/duração inválidos).`,
      action: "check_video",
    };
  }

  // Duplicate content
  if (DUPLICATE_CODES.has(code) || subcode === "1610302" || /duplicate|already published/i.test(message)) {
    return {
      kind: "permanent",
      code: `DUPLICATE:${code}`,
      message,
      humanMessage: `${platformLabel(platform)} identificou este conteúdo como duplicado.`,
      action: "none",
    };
  }

  // Transient Meta / rate limit / 5xx
  if (
    TRANSIENT_META_CODES.has(code) ||
    status === 429 ||
    status >= 500 ||
    /rate limit|timeout|temporarily|is_transient|try again|network/i.test(message)
  ) {
    return {
      kind: "transient",
      code: `TRANSIENT:${code}`,
      message,
      humanMessage: `Instabilidade temporária do ${platformLabel(platform)}. Nova tentativa automática em breve.`,
      action: "none",
    };
  }

  // Default: unknown → transient (safer to retry)
  return {
    kind: "unknown",
    code: `UNKNOWN:${code}`,
    message,
    humanMessage: `Erro ao publicar no ${platformLabel(platform)}: ${message}`,
    action: "none",
  };
}

const BACKOFF_MINUTES = [1, 5, 15, 60];

export function nextAttemptAt(attemptCount: number): Date {
  const idx = Math.min(attemptCount, BACKOFF_MINUTES.length - 1);
  const minutes = BACKOFF_MINUTES[idx];
  return new Date(Date.now() + minutes * 60_000);
}

function platformLabel(p: Platform): string {
  return { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" }[p];
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

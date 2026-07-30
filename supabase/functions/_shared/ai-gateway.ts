// Helper único para chamadas ao Lovable AI Gateway a partir de Edge Functions.
// Garante: validação de chave, timeout, logs completos e erros com status HTTP correto.

export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export class AiGatewayError extends Error {
  status: number;
  code: string;
  detail: string;
  constructor(status: number, code: string, message: string, detail = "") {
    super(message);
    this.name = "AiGatewayError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Traduz o status do gateway para mensagem amigável em PT-BR + status HTTP a repassar. */
export function mapGatewayStatus(status: number, detail: string): AiGatewayError {
  if (status === 402) {
    return new AiGatewayError(
      402,
      "AI_CREDITS_EXHAUSTED",
      "Créditos de IA esgotados. Adicione créditos ao workspace para gerar legendas.",
      detail,
    );
  }
  if (status === 429) {
    return new AiGatewayError(
      429,
      "AI_RATE_LIMITED",
      "Muitas requisições de IA em sequência. Aguarde alguns segundos e tente de novo.",
      detail,
    );
  }
  if (status === 401 || status === 403) {
    return new AiGatewayError(
      502,
      "AI_AUTH_ERROR",
      "Falha de autenticação no serviço de IA. Verifique a configuração do workspace.",
      detail,
    );
  }
  if (status >= 500) {
    return new AiGatewayError(
      502,
      "AI_UPSTREAM_ERROR",
      "O serviço de IA está indisponível no momento. Tente novamente em instantes.",
      detail,
    );
  }
  return new AiGatewayError(
    502,
    "AI_REQUEST_ERROR",
    "Não foi possível gerar o conteúdo com IA agora.",
    detail,
  );
}

type CallOpts = {
  module: string;
  model?: string;
  messages: unknown[];
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
  context?: Record<string, unknown>;
};

/** Chama o gateway e devolve o conteúdo textual da resposta. Lança AiGatewayError. */
export async function callAi(opts: CallOpts): Promise<string> {
  const {
    module,
    model = "google/gemini-2.5-flash",
    messages,
    jsonMode = true,
    temperature,
    timeoutMs = 45_000,
    context = {},
  } = opts;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new AiGatewayError(
      503,
      "AI_KEY_MISSING",
      "IA não configurada neste ambiente (LOVABLE_API_KEY ausente).",
    );
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      const err = mapGatewayStatus(res.status, detail);
      let reason = "";
      try { reason = JSON.parse(detail)?.message ?? JSON.parse(detail)?.title ?? ""; } catch { /* texto puro */ }
      console.error(JSON.stringify({
        module, event: "ai_gateway_error", model, gateway_status: res.status,
        code: err.code, reason: reason || detail.slice(0, 160), detail,
        request_id: res.headers.get("x-lovable-aig-log-id") ?? null,
        ms: Date.now() - started, ...context,
      }));
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const usage = data?.usage ?? {};
    console.info(JSON.stringify({
      module, event: "ai_gateway_ok", model, ms: Date.now() - started,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      finish_reason: data?.choices?.[0]?.finish_reason ?? null,
      chars: typeof content === "string" ? content.length : 0,
      preview: typeof content === "string" ? content.slice(0, 400) : null,
      ...context,
    }));
    if (typeof content !== "string" || !content.trim()) {
      throw new AiGatewayError(502, "AI_EMPTY_RESPONSE", "A IA retornou uma resposta vazia. Tente novamente.");
    }
    return content;

  } catch (e) {
    if (e instanceof AiGatewayError) throw e;
    if ((e as Error)?.name === "AbortError") {
      console.error(JSON.stringify({ module, event: "ai_timeout", timeoutMs, ...context }));
      throw new AiGatewayError(504, "AI_TIMEOUT", "A geração por IA demorou demais. Tente novamente.");
    }
    console.error(JSON.stringify({ module, event: "ai_network_error", error: String(e), ...context }));
    throw new AiGatewayError(502, "AI_NETWORK_ERROR", "Falha de rede ao falar com o serviço de IA.", String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** Faz parse tolerante de JSON vindo do modelo (remove cercas de markdown). */
export function parseModelJson<T = Record<string, unknown>>(raw: string): T {
  const cleaned = String(raw)
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { /* noop */ }
    }
    return {} as T;
  }
}

/** Resposta de erro padronizada de Edge Function (sempre JSON + CORS). */
export function aiErrorResponse(module: string, e: unknown, corsHeaders: Record<string, string>) {
  const err = e instanceof AiGatewayError
    ? e
    : new AiGatewayError(500, "INTERNAL_ERROR", (e as Error)?.message || "Erro interno inesperado.");
  console.error(JSON.stringify({
    module, event: "function_error", code: err.code, status: err.status,
    message: err.message, detail: err.detail, stack: (e as Error)?.stack ?? null,
    timestamp: new Date().toISOString(),
  }));
  return new Response(
    JSON.stringify({ error: err.message, code: err.code, detail: err.detail || undefined }),
    { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

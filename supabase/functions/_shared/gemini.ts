// Cliente oficial do Google Gemini (Generative Language API) para Edge Functions.
// Único ponto de saída do motor de legendas/hashtags/CTA — a chave GEMINI_API_KEY
// só existe no backend e NUNCA é exposta ao frontend.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Ordem de preferência: Gemini 2.5 Flash e sucessores/compatíveis. */
export const GEMINI_MODELS = [
  "gemini-flash-latest", // alias oficial do Flash mais recente disponível na conta
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

// Preço aproximado por 1M tokens (USD) — apenas para custo estimado nos logs.
const PRICE_IN = 0.30;
const PRICE_OUT = 2.50;

export class GeminiError extends Error {
  status: number;
  code: string;
  detail: string;
  constructor(status: number, code: string, message: string, detail = "") {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Converte um data URL (data:image/jpeg;base64,...) em part inline do Gemini. */
export function dataUrlToPart(dataUrl: string): GeminiPart | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl).trim());
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

type CallOpts = {
  module: string;
  stage: string;
  system: string;
  parts: GeminiPart[];
  model?: string;
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
  context?: Record<string, unknown>;
};

/** Chama o Gemini e devolve o texto da resposta. Lança GeminiError. */
export async function callGemini(opts: CallOpts): Promise<{ text: string; model: string }> {
  const {
    module, stage, system, parts,
    model = GEMINI_MODELS[0],
    json = true,
    temperature,
    timeoutMs = 60_000,
    context = {},
  } = opts;

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new GeminiError(503, "GEMINI_KEY_MISSING", "Gemini não configurado (GEMINI_API_KEY ausente).");
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          ...(json ? { responseMimeType: "application/json" } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
        },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 600);
      let reason = "";
      try { reason = JSON.parse(detail)?.error?.message ?? ""; } catch { /* texto puro */ }
      console.error(JSON.stringify({
        module, stage, event: "gemini_error", model, http_status: res.status,
        reason: reason || detail.slice(0, 200), detail, ms: Date.now() - started, ...context,
      }));
      throw mapGeminiStatus(res.status, reason || detail);
    }

    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    const u = data?.usageMetadata ?? {};
    const inTok = Number(u?.promptTokenCount ?? 0);
    const outTok = Number(u?.candidatesTokenCount ?? 0);
    console.info(JSON.stringify({
      module, stage, event: "gemini_ok", model, ms: Date.now() - started,
      prompt_tokens: inTok, completion_tokens: outTok,
      total_tokens: Number(u?.totalTokenCount ?? inTok + outTok),
      estimated_cost_usd: Number(((inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT).toFixed(6)),
      finish_reason: data?.candidates?.[0]?.finishReason ?? null,
      chars: text.length, preview: text.slice(0, 400), ...context,
    }));
    if (!text) throw new GeminiError(502, "GEMINI_EMPTY_RESPONSE", "O Gemini retornou resposta vazia.");
    return { text, model };

  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if ((e as Error)?.name === "AbortError") {
      console.error(JSON.stringify({ module, stage, event: "gemini_timeout", model, timeoutMs, ...context }));
      throw new GeminiError(504, "GEMINI_TIMEOUT", "A geração pelo Gemini demorou demais.");
    }
    console.error(JSON.stringify({ module, stage, event: "gemini_network_error", model, error: String(e), ...context }));
    throw new GeminiError(502, "GEMINI_NETWORK_ERROR", "Falha de rede ao falar com o Gemini.", String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** Tenta cada modelo da lista até um responder. */
export async function callGeminiWithFallback(
  opts: Omit<CallOpts, "model"> & { models?: string[] },
): Promise<{ text: string; model: string }> {
  const models = opts.models?.length ? opts.models : GEMINI_MODELS;
  let last: unknown = null;
  for (const model of models) {
    try {
      return await callGemini({ ...opts, model });
    } catch (e) {
      last = e;
      const code = (e as GeminiError)?.code;
      if (code === "GEMINI_KEY_MISSING") throw e;
      console.warn(JSON.stringify({
        module: opts.module, stage: opts.stage, event: "gemini_model_fallback",
        model, error: String((e as Error)?.message ?? e),
      }));
    }
  }
  throw last instanceof GeminiError
    ? last
    : new GeminiError(502, "GEMINI_UNAVAILABLE", "Nenhum modelo Gemini respondeu.");
}

function mapGeminiStatus(status: number, detail: string): GeminiError {
  if (status === 429) return new GeminiError(429, "GEMINI_RATE_LIMITED", "Limite de requisições do Gemini atingido. Aguarde alguns segundos.", detail);
  if (status === 401 || status === 403) return new GeminiError(502, "GEMINI_AUTH_ERROR", "Chave do Gemini inválida ou sem permissão.", detail);
  if (status === 404) return new GeminiError(502, "GEMINI_MODEL_NOT_FOUND", "Modelo Gemini indisponível.", detail);
  if (status >= 500) return new GeminiError(502, "GEMINI_UPSTREAM_ERROR", "O Gemini está indisponível no momento.", detail);
  return new GeminiError(502, "GEMINI_REQUEST_ERROR", "Não foi possível gerar o conteúdo com o Gemini.", detail);
}

/** Parse tolerante de JSON vindo do modelo. */
export function parseGeminiJson<T = Record<string, unknown>>(raw: string): T {
  const cleaned = String(raw).replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
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

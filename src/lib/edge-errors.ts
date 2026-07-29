// Traduz erros de Edge Functions em mensagens claras para o usuário.
// Evita o genérico "Edge Function returned a non-2xx status code".

const FRIENDLY_BY_CODE: Record<string, string> = {
  AI_CREDITS_EXHAUSTED: "Créditos de IA esgotados. Adicione créditos ao workspace para gerar legendas.",
  AI_RATE_LIMITED: "Muitas gerações seguidas. Aguarde alguns segundos e tente novamente.",
  AI_TIMEOUT: "A IA demorou para responder. Tente novamente.",
  AI_KEY_MISSING: "IA não configurada neste ambiente.",
  AI_EMPTY_RESPONSE: "A IA retornou vazio. Tente novamente.",
  AI_UPSTREAM_ERROR: "Serviço de IA indisponível no momento. Tente novamente em instantes.",
  AI_AUTH_ERROR: "Falha de autenticação no serviço de IA.",
  AI_NETWORK_ERROR: "Falha de rede ao falar com o serviço de IA.",
};

/**
 * Lê o corpo JSON do erro devolvido por supabase.functions.invoke e retorna
 * uma mensagem amigável. Sempre resolve — nunca lança.
 */
export async function describeEdgeError(error: unknown, data?: unknown, fallback = "Falha na operação"): Promise<string> {
  const fromData = (data as any)?.error;
  if (typeof fromData === "string" && fromData.trim()) {
    const code = (data as any)?.code as string | undefined;
    return (code && FRIENDLY_BY_CODE[code]) || fromData;
  }

  const anyErr = error as any;
  if (!anyErr) return fallback;

  // FunctionsHttpError expõe a Response original em .context
  try {
    const ctx = anyErr?.context;
    if (ctx && typeof ctx.text === "function") {
      const text = await ctx.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const code = parsed?.code as string | undefined;
          if (code && FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code];
          if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
          if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
        } catch {
          if (text.length < 300) return text;
        }
      }
    }
  } catch { /* ignora */ }

  const msg = String(anyErr?.message ?? "");
  if (!msg || /non-2xx status code/i.test(msg)) return fallback;
  return msg;
}

/** Versão que já lança um Error com a mensagem amigável. */
export async function throwEdgeError(error: unknown, data?: unknown, fallback = "Falha na operação"): Promise<never> {
  throw new Error(await describeEdgeError(error, data, fallback));
}

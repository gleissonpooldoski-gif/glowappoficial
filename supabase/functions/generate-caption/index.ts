// Edge function: gera legenda + hashtags para um vídeo pronto usando Lovable AI (visão + validação).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  filename?: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
  videoText?: string | null;
  frames?: string[]; // data URLs (image/jpeg;base64,...) extraídos do vídeo no cliente
  style?: string | null; // ex: "curioso", "engraçado", "informativo"
};

const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const normalizeTag = (t: string) => {
  const s = String(t).trim().replace(/\s+/g, "");
  return s.startsWith("#") ? s : `#${s}`;
};

function normalizeHashtags(groups: any) {
  return {
    alcance: Array.isArray(groups?.alcance) ? groups.alcance.map(normalizeTag) : [],
    nicho: Array.isArray(groups?.nicho) ? groups.nicho.map(normalizeTag) : [],
    tema: Array.isArray(groups?.tema) ? groups.tema.map(normalizeTag) : [],
  };
}

async function callModel(apiKey: string, messages: any[], expectJson = true) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(expectJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { _raw: raw };
  }
}

function buildContextText(body: Body) {
  return [
    body.projectName ? `Projeto/página: ${body.projectName}` : null,
    body.projectCategory ? `Nicho: ${body.projectCategory}` : null,
    body.templateName ? `Template aplicado: ${body.templateName}` : null,
    body.filename ? `Arquivo: ${body.filename}` : null,
    body.videoText ? `Texto sobreposto no vídeo: ${body.videoText}` : null,
    body.style ? `Tom desejado: ${body.style}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFrameContent(body: Body) {
  const parts: any[] = [];
  const ctx = buildContextText(body);
  const hasFrames = Array.isArray(body.frames) && body.frames.length > 0;

  parts.push({
    type: "text",
    text:
      (hasFrames
        ? "Analise os frames abaixo (extraídos do vídeo em ordem cronológica) e gere uma legenda + hashtags que descrevam APENAS o que aparece no vídeo. NÃO invente fatos, pessoas, filmes, marcas ou situações que não estejam visíveis.\n\n"
        : "Não há frames disponíveis: gere uma legenda genérica coerente com o nicho, sem inventar detalhes específicos.\n\n") +
      (ctx ? `Contexto adicional (use apenas como complemento):\n${ctx}` : ""),
  });

  if (hasFrames) {
    for (const f of body.frames!) {
      if (typeof f === "string" && f.startsWith("data:image")) {
        parts.push({ type: "image_url", image_url: { url: f } });
      }
    }
  }
  return parts;
}

const GENERATION_SYSTEM = `Você é um social media humano, especialista em Instagram Reels e TikTok em português do Brasil.

Sua tarefa é criar UMA legenda + hashtags com base no que REALMENTE aparece no vídeo (frames anexados).

REGRAS ABSOLUTAS:
- Baseie-se PRIMEIRO no conteúdo visual dos frames.
- NUNCA invente nomes de pessoas, filmes, marcas, lugares, falas ou situações que não estejam visíveis.
- Se não tiver certeza do que é, descreva de forma neutra (ex: "essa cena", "esse momento") em vez de chutar.
- Contexto textual (nicho, template, nome do projeto) é APENAS complemento.

LEGENDA:
- 1 a 3 frases curtas, no máximo ~220 caracteres.
- Tom natural, humano, sem clichê de marketing.
- Gera curiosidade e chama para ação coerente com a cena (comentar, salvar, marcar alguém).
- No máximo 1 emoji, opcional.

HASHTAGS:
- 12 a 18 no total, todas relacionadas ao conteúdo real do vídeo e ao nicho.
- Divididas em 3 grupos: "alcance" (grandes/genéricas do nicho), "nicho" (do segmento), "tema" (específicas do que aparece no vídeo).
- Zero hashtags aleatórias, banidas, spam ou sem contexto.
- Cada hashtag começa com # e não contém espaço.

Responda SOMENTE em JSON válido:
{"caption":"...", "hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;

const VALIDATION_SYSTEM = `Você é um revisor crítico de social media. Receberá os frames de um vídeo e uma legenda proposta.

Sua tarefa: verificar se a legenda é FIEL ao vídeo.

Cheque:
1. A legenda descreve/conversa com o que realmente aparece nos frames?
2. Há informações inventadas (pessoas, filmes, marcas, falas, lugares) que não estão visíveis?
3. As hashtags estão relacionadas ao conteúdo real e ao nicho?
4. A chamada para ação faz sentido para a cena?

Responda SOMENTE em JSON válido:
{"ok": true|false, "reason": "explique brevemente se ok=false"}

Seja rigoroso: se houver QUALQUER informação inventada ou desconectada, ok=false.`;

async function generateOnce(apiKey: string, body: Body) {
  const parts = buildFrameContent(body);
  const result = await callModel(apiKey, [
    { role: "system", content: GENERATION_SYSTEM },
    { role: "user", content: parts },
  ]);
  const caption = String(result?.caption ?? "").trim();
  const hashtags = normalizeHashtags(result?.hashtags ?? {});
  return { caption, hashtags };
}

async function validate(apiKey: string, body: Body, caption: string, hashtags: any) {
  const hasFrames = Array.isArray(body.frames) && body.frames.length > 0;
  if (!hasFrames) return { ok: true, reason: "sem frames para validar" };

  const parts: any[] = [
    {
      type: "text",
      text:
        `Legenda proposta:\n"${caption}"\n\nHashtags: ${[
          ...hashtags.alcance, ...hashtags.nicho, ...hashtags.tema,
        ].join(" ")}\n\nAgora avalie contra os frames.`,
    },
  ];
  for (const f of body.frames!) {
    if (typeof f === "string" && f.startsWith("data:image")) {
      parts.push({ type: "image_url", image_url: { url: f } });
    }
  }
  try {
    const res = await callModel(apiKey, [
      { role: "system", content: VALIDATION_SYSTEM },
      { role: "user", content: parts },
    ]);
    return { ok: Boolean(res?.ok), reason: String(res?.reason ?? "") };
  } catch (e) {
    console.error("[generate-caption] validation error", e);
    return { ok: true, reason: "validação indisponível" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "LOVABLE_API_KEY ausente" });

    const body = (await req.json()) as Body;

    const MAX_ATTEMPTS = 3;
    let lastResult: { caption: string; hashtags: any } | null = null;
    let lastReason = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const gen = await generateOnce(apiKey, body);
        lastResult = gen;
        if (!gen.caption) { lastReason = "legenda vazia"; continue; }

        const v = await validate(apiKey, body, gen.caption, gen.hashtags);
        if (v.ok) {
          return json(200, { ...gen, validated: true, attempts: attempt });
        }
        lastReason = v.reason || "reprovada na validação";
        console.warn(`[generate-caption] attempt ${attempt} rejeitada: ${lastReason}`);
      } catch (e: any) {
        if (e?.status === 429) return json(429, { error: "Limite de requisições atingido. Tente novamente em instantes." });
        if (e?.status === 402) return json(402, { error: "Créditos de IA esgotados. Adicione créditos no workspace." });
        console.error("[generate-caption] attempt error", e);
        lastReason = e?.message ?? "erro no modelo";
      }
    }

    // Fallback: devolve última tentativa mesmo assim, sinalizando que não validou
    if (lastResult) {
      return json(200, { ...lastResult, validated: false, warning: lastReason });
    }
    return json(500, { error: "Falha ao gerar legenda." });
  } catch (e) {
    console.error("[generate-caption] fatal", e);
    return json(500, { error: (e as Error).message });
  }
});

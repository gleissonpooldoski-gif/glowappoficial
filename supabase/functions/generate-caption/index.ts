// Edge function: gera legenda + hashtags para um vídeo pronto usando Lovable AI (visão + validação).
import { AiGatewayError, aiErrorResponse, callAi, parseModelJson } from "../_shared/ai-gateway.ts";

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

async function callModel(_apiKey: string, messages: any[], expectJson = true) {
  const raw = await callAi({
    module: "generate-caption",
    model: MODEL,
    messages,
    jsonMode: expectJson,
    context: { gateway: GATEWAY },
  });
  return parseModelJson<any>(raw);
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

function isSegredoProject(name?: string | null, cat?: string | null): boolean {
  const s = `${name ?? ""} ${cat ?? ""}`.toLowerCase();
  return s.includes("segredo") || s.includes("promo") || s.includes("achad");
}

const GENERATION_SYSTEM_BASE = `Você é um social media humano, especialista em Instagram Reels em português do Brasil.

Sua tarefa é criar UMA legenda + hashtags OTIMIZADAS PARA INSTAGRAM com base no que REALMENTE aparece no vídeo (frames anexados).

REGRAS ABSOLUTAS:
- Baseie-se PRIMEIRO no conteúdo visual dos frames.
- NUNCA invente nomes de pessoas, filmes, marcas, lugares, falas ou situações que não estejam visíveis.
- Se não tiver certeza do que é, descreva de forma neutra (ex: "essa cena", "esse momento") em vez de chutar.
- Contexto textual (nicho, template, nome do projeto) é APENAS complemento.

LEGENDA (otimizada para Instagram):
- 1 a 3 frases curtas, no máximo ~220 caracteres.
- A PRIMEIRA frase é um GANCHO forte que prende nos primeiros 2 segundos (pergunta, afirmação inesperada, curiosidade).
- Pensada para gerar COMENTÁRIOS, SALVAMENTOS e COMPARTILHAMENTOS (não só likes).
- Tom natural, humano, conversacional. Zero clichê de marketing.
- Termine com uma micro-CTA coerente com a cena (ex: "comenta aí", "marca alguém", "salva pra depois").
- 0 a 2 emojis, só se agregarem.

HASHTAGS (estratégia de descoberta no Instagram):
- 12 a 18 no total, todas relacionadas ao conteúdo real do vídeo, nicho e público-alvo.
- Divididas em 3 grupos: "alcance" (grandes/genéricas do nicho, alto volume, termos de descoberta), "nicho" (segmento específico e público-alvo), "tema" (específicas do que aparece no vídeo).
- Misture volumes: algumas amplas para alcance + várias específicas para relevância.
- Zero hashtags aleatórias, banidas, spam ou sem contexto.
- Cada hashtag começa com # e não contém espaço.

Responda SOMENTE em JSON válido:
{"caption":"...", "hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;

const SEGREDO_STRATEGY = `

MODO ESPECIAL — PROJETO SEGREDO DAS PROMOÇÕES (estratégia de CONVERSÃO por curiosidade):
- Nunca faça texto meramente descritivo do produto. O objetivo é DESPERTAR CURIOSIDADE.
- PROIBIDO incluir links, URLs, domínios, códigos de afiliado ou @menções na legenda.
- PROIBIDO mencionar "link na bio", "confira na bio", "veja na bio", "está na bio", "mais informações na bio", "passe na bio", "os detalhes estão na bio" ou qualquer variação semelhante. Essa chamada JÁ está no template da legenda e não deve ser repetida.
- A CTA/legenda deve servir APENAS para despertar curiosidade e prender atenção. Selecione ALEATORIAMENTE um dos modelos abaixo (ou crie variações naturais no mesmo estilo, sem repetir sempre o mesmo, e SEM mencionar bio):
  "👀 Tem muita gente perguntando onde encontrar esse produto."
  "🔥 Esse produto está chamando muita atenção."
  "✨ Achei esse produto e precisei compartilhar."
  "💡 Esse pode ser um daqueles produtos que facilitam bastante o dia a dia."
  "🤔 Muita gente ainda não conhece esse achado."
  "💬 Se quiser saber qual é esse produto, comenta aí."
  "😅 Depois que descobri esse produto fiquei pensando como não conhecia antes."
  "🚀 Esse produto está aparecendo para muita gente ultimamente."
  "👀 Você teria esse produto?"
  "😳 Confesso que não esperava que isso existisse."
  "📦 Mais um achadinho interessante."
  "✨ Esse é um daqueles produtos que quase ninguém conhece."
  "👀 Vale a pena conhecer esse produto."
  "😅 Muita gente já perguntou onde encontrar."
  "💬 Quem já conhece esse produto sabe do que estou falando."
  "🛍️ Esse é o tipo de produto que surpreende."
  "🤯 Não imaginei que um produto assim existisse."
  "⭐ Esse achado merece atenção."
  "📢 Esse produto está dando o que falar."
  "👀 Aposto que você ficou curioso para saber qual é."
- Nunca repita exatamente a mesma frase em vídeos consecutivos. Mantenha linguagem natural, evite soar robótico.
- Tom: gancho de curiosidade, sem exagero de clickbait. Estimular o usuário a continuar assistindo/lendo ou comentar pedindo mais informações — sem nunca citar a bio.`;

const GENERATION_SYSTEM = GENERATION_SYSTEM_BASE;

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
  const system = GENERATION_SYSTEM +
    (isSegredoProject(body.projectName, body.projectCategory) ? SEGREDO_STRATEGY : "");
  const result = await callModel(apiKey, [
    { role: "system", content: system },
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
  if (req.method !== "POST") {
    return json(405, { error: "Método não suportado.", code: "METHOD_NOT_ALLOWED" });
  }

  const startedAt = Date.now();
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(400, { error: "Corpo da requisição inválido (JSON esperado).", code: "INVALID_BODY" });
    }
    if (body === null || typeof body !== "object") {
      return json(400, { error: "Corpo da requisição inválido.", code: "INVALID_BODY" });
    }
    if (body.frames !== undefined && !Array.isArray(body.frames)) {
      return json(400, { error: "'frames' deve ser uma lista de data URLs.", code: "INVALID_FRAMES" });
    }
    // Protege memória do worker: no máximo 6 frames
    if (Array.isArray(body.frames) && body.frames.length > 6) body.frames = body.frames.slice(0, 6);

    console.info(JSON.stringify({
      module: "generate-caption", event: "request",
      project: body.projectName ?? null, category: body.projectCategory ?? null,
      filename: body.filename ?? null, frames: body.frames?.length ?? 0,
      timestamp: new Date().toISOString(),
    }));

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
      } catch (e) {
        // Erros de crédito/limite/timeout são definitivos: não adianta repetir.
        if (e instanceof AiGatewayError && e.code !== "AI_EMPTY_RESPONSE") {
          return aiErrorResponse("generate-caption", e, corsHeaders);
        }
        console.error(JSON.stringify({
          module: "generate-caption", event: "attempt_error", attempt,
          error: String((e as Error)?.message ?? e), stack: (e as Error)?.stack ?? null,
        }));
        lastReason = (e as Error)?.message ?? "erro no modelo";
      }
    }

    // Fallback: devolve última tentativa mesmo assim, sinalizando que não validou
    if (lastResult?.caption) {
      return json(200, { ...lastResult, validated: false, warning: lastReason, ms: Date.now() - startedAt });
    }
    return json(502, { error: "Não foi possível gerar a legenda agora. Tente novamente.", code: "AI_NO_RESULT", detail: lastReason });
  } catch (e) {
    return aiErrorResponse("generate-caption", e, corsHeaders);
  }

});

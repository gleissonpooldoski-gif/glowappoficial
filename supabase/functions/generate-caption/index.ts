// Edge function ÚNICA de geração automática de legenda + CTA + hashtags.
// Regras:
// - Analisa o vídeo (frames) para descrever o que realmente aparece.
// - NUNCA falha: se a IA principal estiver indisponível (créditos, limite, timeout),
//   tenta modelos alternativos e, em último caso, usa fallback local por template.
// - Sempre responde 200 com { caption, cta, hashtags:{alcance,nicho,tema}, source }.
import { callAi, parseModelJson } from "../_shared/ai-gateway.ts";

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
  frames?: string[];
  style?: string | null;
  history?: string[]; // legendas recentes do projeto (evitar repetição)
};

// Cadeia de modelos: visão primeiro, depois alternativas mais baratas/rápidas.
const VISION_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-5.4-mini",
];
const TEXT_MODELS = [
  "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5.4-nano",
];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const normalizeTag = (t: string) => {
  const s = String(t).trim().replace(/^#+/, "").replace(/\s+/g, "");
  return s ? `#${s}` : "";
};

function normalizeHashtags(groups: any) {
  const pick = (v: any) => (Array.isArray(v) ? v.map(normalizeTag).filter(Boolean) : []);
  return { alcance: pick(groups?.alcance), nicho: pick(groups?.nicho), tema: pick(groups?.tema) };
}

function isSegredoProject(name?: string | null, cat?: string | null): boolean {
  const s = `${name ?? ""} ${cat ?? ""}`.toLowerCase();
  return s.includes("segredo") || s.includes("promo") || s.includes("achad");
}

function buildContextText(body: Body) {
  return [
    body.projectName ? `Projeto/página: ${body.projectName}` : null,
    body.projectCategory ? `Nicho/categoria: ${body.projectCategory}` : null,
    body.templateName ? `Template aplicado: ${body.templateName}` : null,
    body.filename ? `Arquivo: ${body.filename}` : null,
    body.videoText ? `Texto sobreposto no vídeo: ${body.videoText}` : null,
    body.style ? `Tom de voz desejado: ${body.style}` : null,
    Array.isArray(body.history) && body.history.length
      ? `Legendas recentes desta página (NÃO repita estruturas nem frases):\n- ${body.history.slice(0, 8).join("\n- ")}`
      : null,
  ].filter(Boolean).join("\n");
}

const SYSTEM_BASE = `Você é um social media brasileiro, humano, especialista em Reels/Shorts/TikTok.

ETAPA 1 — ANÁLISE DO VÍDEO (obrigatória, mentalmente):
A partir dos frames em ordem cronológica, identifique:
- produtos e objetos visíveis (formato, cor, material, uso aparente);
- pessoas (quantidade, ação, expressão) sem inventar identidades;
- cenário/ambiente;
- textos presentes na tela (leia o que está escrito — OCR);
- sequência das cenas e a AÇÃO PRINCIPAL do vídeo.

ETAPA 2 — ESCRITA:
Escreva como alguém que ASSISTIU ao vídeo. A legenda precisa ser específica ao que foi visto.
PROIBIDO texto genérico como "Confira essa promoção", "Produto incrível", "Olha isso", "Imperdível", "Você precisa ver".
Se algo não estiver claro nos frames, descreva de forma neutra ("essa cena", "esse momento") — nunca invente nomes, marcas, filmes, falas ou lugares.
O nicho/categoria serve APENAS para adaptar a linguagem, nunca para substituir a análise do vídeo.

LEGENDA:
- 1 a 3 frases curtas (máx. ~220 caracteres), tom natural e conversacional.
- Primeira frase = gancho forte ligado ao que aparece no vídeo.
- Zero clichê de marketing, 0 a 2 emojis.
- Sem hashtags dentro da legenda.

CTA (campo separado):
- Uma frase curta, coerente com o conteúdo identificado:
  beleza → convidar a conhecer o kit/rotina; tecnologia → destacar funcionalidades;
  casa → destacar praticidade; moda → destacar estilo; fitness → destacar benefícios;
  conteúdo/curiosidade → estimular comentário, salvamento ou marcação.
- Sem links, URLs ou @menções.

HASHTAGS:
- 12 a 18 no total, sempre derivadas do conteúdo identificado no vídeo + nicho + categoria + palavras do produto.
- Grupos: "alcance" (amplas de alto volume), "nicho" (segmento e público), "tema" (específicas do que aparece).
- Misture hashtags grandes e específicas; varie entre vídeos, não repita sempre o mesmo conjunto.
- Cada hashtag começa com # e não tem espaços.

Responda SOMENTE JSON válido:
{"analysis":"resumo objetivo do que aparece no vídeo","caption":"...","cta":"...","hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;

const SEGREDO_STRATEGY = `

MODO ESPECIAL — PROJETO DE PROMOÇÕES/ACHADOS (conversão por curiosidade):
- Descreva o produto que aparece no vídeo de forma concreta, mas conduza para a CURIOSIDADE.
- PROIBIDO links, URLs, códigos de afiliado, @menções e qualquer variação de "link na bio"/"confira na bio" (já existe no template).
- O CTA deve despertar curiosidade ou pedir comentário, variando a cada vídeo.`;

function framesOf(body: Body): string[] {
  return (Array.isArray(body.frames) ? body.frames : []).filter(
    (f) => typeof f === "string" && f.startsWith("data:image"),
  );
}

function buildUserParts(body: Body, frames: string[]) {
  const ctx = buildContextText(body);
  const parts: any[] = [{
    type: "text",
    text:
      (frames.length
        ? "Analise os frames abaixo (ordem cronológica do vídeo) e gere legenda, CTA e hashtags fiéis ao que aparece.\n\n"
        : "Não há frames disponíveis. Use o contexto abaixo para gerar o texto mais específico possível, sem inventar detalhes visuais.\n\n") +
      (ctx ? `Contexto do projeto (complemento):\n${ctx}` : ""),
  }];
  for (const f of frames) parts.push({ type: "image_url", image_url: { url: f } });
  return parts;
}

async function tryModels(models: string[], messages: any[], context: Record<string, unknown>) {
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const raw = await callAi({
        module: "generate-caption",
        model,
        messages,
        jsonMode: true,
        timeoutMs: 40_000,
        context: { ...context, model },
      });
      const parsed = parseModelJson<any>(raw);
      if (parsed && String(parsed.caption ?? "").trim()) return { parsed, model };
    } catch (e) {
      lastErr = e;
      console.warn(JSON.stringify({
        module: "generate-caption", event: "model_failed", model,
        error: String((e as Error)?.message ?? e),
      }));
    }
  }
  if (lastErr) console.error(JSON.stringify({ module: "generate-caption", event: "all_models_failed" }));
  return null;
}

// ---------------- Fallback local (nunca deixa o usuário sem texto) ----------------

const NICHE_RULES: Array<{ test: RegExp; tags: string[]; cta: string; lead: string }> = [
  { test: /belez|skin|makeup|maquia|cabelo|cosm/i,
    tags: ["beleza", "skincare", "autocuidado", "rotinadebeleza", "dicasdebeleza"],
    cta: "Vale conhecer o kit completo antes de montar sua rotina.",
    lead: "Esse cuidado simples muda o resultado da rotina" },
  { test: /tech|tecnolog|gadget|eletr|celular|smart/i,
    tags: ["tecnologia", "gadgets", "techbrasil", "inovacao", "eletronicos"],
    cta: "Repare nas funções que ele entrega em tão pouco espaço.",
    lead: "Um detalhe de tecnologia que resolve mais do que parece" },
  { test: /casa|cozinha|organiza|lar|decor|utilid/i,
    tags: ["casa", "organizacao", "utilidadesdomesticas", "dicasdecasa", "praticidade"],
    cta: "Praticidade assim faz diferença no dia a dia da casa.",
    lead: "Uma solução prática pra facilitar a rotina em casa" },
  { test: /moda|roupa|estilo|look|fashion/i,
    tags: ["moda", "estilo", "lookdodia", "modabrasil", "inspiracao"],
    cta: "Dá pra montar looks diferentes só mudando um detalhe.",
    lead: "Um detalhe de estilo que muda o look inteiro" },
  { test: /fitness|treino|academia|saude|emagre/i,
    tags: ["fitness", "treino", "saude", "vidasaudavel", "disciplina"],
    cta: "Constância nos detalhes é o que traz o resultado.",
    lead: "Pequenos ajustes no treino que fazem diferença real" },
  { test: /film|cinema|serie|frame|cena/i,
    tags: ["cinema", "filmes", "cenas", "setimaarte", "curiosidades"],
    cta: "Comenta aí o que essa cena te fez sentir.",
    lead: "Essa cena carrega mais coisa do que parece" },
  { test: /meme|humor|engra|risada/i,
    tags: ["memes", "humor", "risada", "engracado", "viral"],
    cta: "Marca alguém que ia rir com isso.",
    lead: "Difícil assistir isso sem rir" },
  { test: /curios|hist[oó]ria|fato|saber/i,
    tags: ["curiosidades", "voceSabia", "fatos", "aprendanotiktok", "conhecimento"],
    cta: "Salva pra lembrar disso depois.",
    lead: "Poucas pessoas conhecem esse detalhe" },
];

const GENERIC_TAGS = ["reels", "viral", "fyp", "paravoce", "conteudo", "brasil", "explorar", "tiktokbrasil"];

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function localFallback(body: Body) {
  const haystack = `${body.projectName ?? ""} ${body.projectCategory ?? ""} ${body.templateName ?? ""} ${body.filename ?? ""} ${body.videoText ?? ""}`;
  const rule = NICHE_RULES.find((r) => r.test.test(haystack));
  const promo = isSegredoProject(body.projectName, body.projectCategory);

  const overlay = String(body.videoText ?? "").replace(/\s+/g, " ").trim();
  const lead = overlay
    ? overlay.slice(0, 120)
    : rule?.lead ?? "Vale a pena assistir até o final pra entender esse detalhe";

  const cta = promo
    ? "Muita gente está procurando por esse achado — comenta aí se você conhece."
    : rule?.cta ?? "Comenta aí o que você achou e salva pra rever depois.";

  const caption = `${lead}. ${cta}`.replace(/\s+/g, " ").slice(0, 260);

  const nicheWords = (body.projectCategory ?? "").split(/[\s,/&-]+/).map(slug).filter((w) => w.length > 2);
  const projWords = (body.projectName ?? "").split(/[\s,/&-]+/).map(slug).filter((w) => w.length > 3);
  const overlayWords = overlay.split(/[\s,.;!?]+/).map(slug).filter((w) => w.length > 4).slice(0, 4);

  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
  // varia o conjunto amplo entre gerações para não repetir sempre as mesmas
  const shuffled = GENERIC_TAGS.slice().sort(() => Math.random() - 0.5);

  return {
    caption,
    cta,
    hashtags: {
      alcance: uniq(shuffled.slice(0, 5)).map((t) => `#${t}`),
      nicho: uniq([...nicheWords, ...projWords, ...(rule?.tags ?? [])]).slice(0, 6).map((t) => `#${slug(t)}`),
      tema: uniq([...overlayWords, ...(rule?.tags ?? []).slice(0, 3)]).slice(0, 5).map((t) => `#${slug(t)}`),
    },
  };
}

const GENERIC_RE = /^(confira essa promo|produto incr[ií]vel|olha isso|imperd[ií]vel|voc[êe] precisa ver)/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não suportado.", code: "METHOD_NOT_ALLOWED" });

  const startedAt = Date.now();
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch { /* corpo vazio → fallback */ }

  try {
    const frames = framesOf(body);
    const system = SYSTEM_BASE + (isSegredoProject(body.projectName, body.projectCategory) ? SEGREDO_STRATEGY : "");
    const messages = [
      { role: "system", content: system },
      { role: "user", content: buildUserParts(body, frames) },
    ];

    const models = frames.length ? VISION_MODELS : TEXT_MODELS;
    let res = await tryModels(models, messages, { project: body.projectName, frames: frames.length });

    // Se falhou com frames (peso/limite), tenta sem frames antes de cair no fallback local.
    if (!res && frames.length) {
      const textMessages = [
        { role: "system", content: system },
        { role: "user", content: buildUserParts(body, []) },
      ];
      res = await tryModels(TEXT_MODELS, textMessages, { project: body.projectName, frames: 0 });
    }

    if (res) {
      const caption = String(res.parsed.caption ?? "").trim();
      const cta = String(res.parsed.cta ?? "").trim();
      const hashtags = normalizeHashtags(res.parsed.hashtags ?? {});
      const total = hashtags.alcance.length + hashtags.nicho.length + hashtags.tema.length;
      const weak = !caption || GENERIC_RE.test(caption);
      if (!weak) {
        const fb = total < 6 ? localFallback(body) : null;
        return json(200, {
          caption,
          cta: cta || localFallback(body).cta,
          hashtags: fb
            ? {
                alcance: Array.from(new Set([...hashtags.alcance, ...fb.hashtags.alcance])).slice(0, 6),
                nicho: Array.from(new Set([...hashtags.nicho, ...fb.hashtags.nicho])).slice(0, 6),
                tema: Array.from(new Set([...hashtags.tema, ...fb.hashtags.tema])).slice(0, 6),
              }
            : hashtags,
          analysis: String(res.parsed.analysis ?? ""),
          model: res.model,
          source: "ai",
          validated: true,
          ms: Date.now() - startedAt,
        });
      }
    }

    const fb = localFallback(body);
    console.warn(JSON.stringify({
      module: "generate-caption", event: "local_fallback_used",
      project: body.projectName, frames: frames.length, ms: Date.now() - startedAt,
    }));
    return json(200, { ...fb, source: "fallback", validated: false, ms: Date.now() - startedAt });
  } catch (e) {
    // Último nível: nunca devolve erro ao cliente.
    console.error(JSON.stringify({
      module: "generate-caption", event: "unexpected_error",
      error: String((e as Error)?.message ?? e),
    }));
    const fb = localFallback(body);
    return json(200, { ...fb, source: "fallback", validated: false });
  }
});

// Edge function ÚNICA de geração automática de legenda + CTA + hashtags.
// Regras:
// - Analisa o vídeo (frames) para descrever o que realmente aparece.
// - Aplica técnicas profissionais de copywriting/social media, adaptando-se
//   automaticamente a QUALQUER nicho (sem regras fixas por nicho).
// - NUNCA falha: se a IA principal estiver indisponível (créditos, limite, timeout),
//   tenta modelos alternativos e, em último caso, usa fallback local.
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
  history?: string[];         // legendas recentes (evitar repetição de estrutura)
  recentHashtags?: string[];  // hashtags recentes (evitar repetição de conjunto)
  variationSeed?: number;     // força variação entre gerações
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

function isPromoProject(name?: string | null, cat?: string | null): boolean {
  const s = `${name ?? ""} ${cat ?? ""}`.toLowerCase();
  return /segredo|promo|achad|shopee|amazon|mercado livre|oferta|desconto|cupom/.test(s);
}

// ---- Rotação de estruturas: garante variedade real entre publicações ----
const HOOK_FORMULAS = [
  "Gancho de contraste: mostre o antes/depois ou a expectativa vs. o que aparece no vídeo.",
  "Gancho de curiosidade: revele parcialmente um detalhe visto no vídeo e deixe a explicação para a segunda frase.",
  "Gancho de problema: nomeie a dor concreta que o que aparece no vídeo resolve.",
  "Gancho de dado/observação específica: comece por um detalhe visual preciso que quase ninguém repara.",
  "Gancho de opinião direta: uma afirmação forte e defensável sobre o que aparece no vídeo.",
  "Gancho de pergunta aberta: pergunta específica sobre a cena, que dá vontade de responder nos comentários.",
  "Gancho narrativo: comece no meio da ação, como se contasse a cena para um amigo.",
  "Gancho de utilidade: prometa, já na primeira linha, o que a pessoa ganha assistindo até o fim.",
];

const CTA_INTENTS = [
  "pedir comentário com uma pergunta específica ligada ao vídeo",
  "incentivar salvar o vídeo para usar depois",
  "incentivar compartilhar/marcar alguém que precisa ver",
  "convidar a assistir até o fim ou rever o detalhe",
  "convidar a seguir a página por mais conteúdos como esse",
  "provocar uma escolha (isso ou aquilo) nos comentários",
];

const TONES = [
  "conversacional e direto",
  "entusiasmado sem exagero",
  "curioso e investigativo",
  "prático e objetivo",
  "leve e bem-humorado quando o conteúdo permitir",
];

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

function buildContextText(body: Body) {
  return [
    body.projectName ? `Projeto/página: ${body.projectName}` : null,
    body.projectCategory ? `Nicho/categoria: ${body.projectCategory}` : null,
    body.templateName ? `Template aplicado: ${body.templateName}` : null,
    body.filename ? `Arquivo: ${body.filename}` : null,
    body.videoText ? `Texto sobreposto no vídeo: ${body.videoText}` : null,
    body.style ? `Tom de voz desejado: ${body.style}` : null,
    Array.isArray(body.history) && body.history.length
      ? `Legendas recentes desta página (NÃO repita estruturas, ganchos nem frases):\n- ${body.history.slice(0, 8).join("\n- ")}`
      : null,
    Array.isArray(body.recentHashtags) && body.recentHashtags.length
      ? `Hashtags usadas recentemente (troque a maior parte delas):\n${body.recentHashtags.slice(0, 30).join(" ")}`
      : null,
  ].filter(Boolean).join("\n");
}

function buildSystem(body: Body) {
  const seed = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();
  const hook = pick(HOOK_FORMULAS, seed);
  const ctaIntent = pick(CTA_INTENTS, seed >> 3);
  const tone = pick(TONES, seed >> 6);

  return `Você é um social media e copywriter brasileiro sênior, especialista em Reels/Shorts/TikTok, focado em maximizar retenção, comentários, compartilhamentos, salvamentos e alcance.

ETAPA 1 — ANÁLISE DO VÍDEO (obrigatória, mentalmente):
A partir dos frames em ordem cronológica, identifique:
- produto/objeto principal (formato, cor, material, uso aparente);
- contexto e ambiente da cena;
- ação principal e o que acontece do primeiro ao último frame;
- pessoas (quantidade, ação, expressão) sem inventar identidades;
- textos presentes na tela (leia o que está escrito — OCR);
- tema principal e emoção predominante (curiosidade, surpresa, humor, desejo, alívio, indignação...).

A legenda deve ser construída PRINCIPALMENTE a partir dessa análise.
O nicho/categoria é apenas contexto de linguagem — nunca substitui o que foi visto.
Adapte-se automaticamente a qualquer nicho (promoções, marketplaces, moda, beleza, fitness, tecnologia, maternidade, pets, casa, cozinha, decoração, automóveis, educação, humor, curiosidades, notícias, finanças, saúde, games e outros) sem usar fórmulas prontas de nicho.

ETAPA 2 — ESCRITA (copywriting profissional):
Estrutura obrigatória da legenda:
1) GANCHO — ${hook}
2) DESENVOLVIMENTO — 1 ou 2 frases coerentes com o que aparece no vídeo, com benefício claro ou informação concreta; adicione curiosidade quando fizer sentido.
3) O CTA vai no campo separado, não repita ele dentro da legenda.

Tom desta geração: ${tone}.
Regras de qualidade:
- 2 a 4 frases curtas (máx. ~300 caracteres), linguagem natural de pessoa real.
- Zero clichê de marketing. PROIBIDO: "Confira essa promoção", "Produto incrível", "Olha isso", "Imperdível", "Você precisa ver", "Corre lá", "Simplesmente perfeito".
- 0 a 2 emojis no total, apenas se somarem sentido.
- Sem hashtags dentro da legenda. Sem links, URLs ou @menções.
- Nunca invente nomes, marcas, preços, filmes, falas ou lugares que não estejam visíveis.
- Se algo não estiver claro nos frames, descreva de forma neutra ("essa cena", "esse detalhe").
- NÃO repita a estrutura das legendas recentes informadas no contexto.

CTA (campo separado):
- Uma frase curta e natural, cuja intenção nesta geração é: ${ctaIntent}.
- Deve ser específica ao conteúdo do vídeo, não genérica, e variar a cada publicação.
- Sem links, URLs ou @menções.

HASHTAGS (12 a 18 no total):
- Derivadas do conteúdo identificado no vídeo + produto + tema + nicho + categoria.
- "alcance": 3 a 5 amplas e de descoberta (alto volume).
- "nicho": 4 a 6 do segmento e do público-alvo (incluindo hashtags de comunidade).
- "tema": 4 a 7 específicas do que realmente aparece no vídeo.
- Troque a maior parte das hashtags usadas recentemente (listadas no contexto).
- Nada de hashtags irrelevantes, banidas ou spam. Cada hashtag começa com # e não tem espaços.

PERSONALIZAÇÃO:
- Escreva como se a legenda fosse feita sob medida para essa página específica: use o nome/nicho/histórico do projeto para calibrar vocabulário, formalidade e público.

Responda SOMENTE JSON válido:
{"analysis":"resumo objetivo do que aparece no vídeo","caption":"...","cta":"...","hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;
}

const PROMO_STRATEGY = `

MODO PROMOÇÕES/ACHADOS (conversão por curiosidade):
- Descreva o produto que aparece de forma concreta (uso real, benefício percebido) e conduza para a curiosidade.
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

// Dicas de vocabulário por nicho — usadas SOMENTE no fallback local (sem IA).
const NICHE_RULES: Array<{ test: RegExp; tags: string[]; lead: string }> = [
  { test: /belez|skin|makeup|maquia|cabelo|cosm|perfum/i,
    tags: ["beleza", "skincare", "autocuidado", "rotinadebeleza", "dicasdebeleza"],
    lead: "Esse detalhe simples muda o resultado da rotina de cuidado" },
  { test: /tech|tecnolog|gadget|eletr|celular|smart|note|pc/i,
    tags: ["tecnologia", "gadgets", "techbrasil", "inovacao", "eletronicos"],
    lead: "Repara no que esse aparelho entrega em tão pouco espaço" },
  { test: /casa|cozinha|organiza|lar|decor|utilid|limpez/i,
    tags: ["casa", "organizacao", "utilidadesdomesticas", "dicasdecasa", "praticidade"],
    lead: "Uma solução prática que resolve um problema chato da casa" },
  { test: /moda|roupa|estilo|look|fashion|calcad|tenis/i,
    tags: ["moda", "estilo", "lookdodia", "modabrasil", "inspiracao"],
    lead: "Um detalhe de estilo que muda o look inteiro" },
  { test: /fitness|treino|academia|emagre|muscul/i,
    tags: ["fitness", "treino", "vidasaudavel", "disciplina", "academia"],
    lead: "Pequenos ajustes no treino que mudam o resultado real" },
  { test: /saude|bem.?estar|medic|nutri/i,
    tags: ["saude", "bemestar", "qualidadedevida", "habitos", "cuidese"],
    lead: "Um hábito pequeno que faz diferença maior do que parece" },
  { test: /pet|cachorro|gato|animal/i,
    tags: ["pets", "petlovers", "cachorro", "gatos", "vidadepet"],
    lead: "Quem tem pet em casa entende essa cena na hora" },
  { test: /matern|bebe|gravid|filho|crian/i,
    tags: ["maternidade", "maternidadereal", "bebe", "filhos", "dicasdemae"],
    lead: "Quem vive a maternidade reconhece esse momento de longe" },
  { test: /auto|carro|moto|veicul|garag/i,
    tags: ["carros", "automotivo", "motores", "carrosbrasil", "dicasautomotivas"],
    lead: "Esse detalhe passa despercebido por quase todo motorista" },
  { test: /financ|dinheiro|invest|economia|renda/i,
    tags: ["financas", "dinheiro", "educacaofinanceira", "investimentos", "economia"],
    lead: "Uma conta simples que muda como você enxerga esse gasto" },
  { test: /educa|estud|aula|curso|aprend/i,
    tags: ["educacao", "aprendanotiktok", "estudos", "dicasdeestudo", "conhecimento"],
    lead: "Explicação rápida que economiza horas de estudo" },
  { test: /game|jogo|gamer|console/i,
    tags: ["games", "gamer", "gameplay", "jogos", "gamingbrasil"],
    lead: "Detalhe de gameplay que só quem joga muito percebe" },
  { test: /noticia|jornal|atual|polit/i,
    tags: ["noticias", "atualidades", "informacao", "fatos", "brasil"],
    lead: "O que aparece aqui explica melhor do que qualquer manchete" },
  { test: /film|cinema|serie|frame|cena/i,
    tags: ["cinema", "filmes", "cenas", "setimaarte", "curiosidades"],
    lead: "Essa cena carrega mais coisa do que parece" },
  { test: /meme|humor|engra|risada/i,
    tags: ["memes", "humor", "risada", "engracado", "comedia"],
    lead: "Difícil assistir isso sem rir" },
  { test: /curios|hist[oó]ria|fato|saber/i,
    tags: ["curiosidades", "vocesabia", "fatos", "conhecimento", "aprendanotiktok"],
    lead: "Poucas pessoas conhecem esse detalhe" },
  { test: /promo|achad|shopee|amazon|mercado|oferta|descont/i,
    tags: ["achadinhos", "achados", "compras", "dicasdecompra", "custobeneficio"],
    lead: "Esse achadinho resolve mais coisa do que o tamanho dele sugere" },
];

const GENERIC_TAGS = [
  "reels", "viral", "fyp", "paravoce", "conteudo", "brasil", "explorar",
  "tiktokbrasil", "shorts", "trend", "dicas", "descobrindo",
];

const FALLBACK_CTAS = [
  "Comenta aí o que você achou disso.",
  "Salva pra não perder esse detalhe depois.",
  "Marca alguém que precisa ver isso.",
  "Assiste de novo e repara no final.",
  "Me conta nos comentários se você faria igual.",
  "Segue aqui pra ver mais conteúdos assim.",
];

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function localFallback(body: Body) {
  const seed = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();
  const haystack = `${body.projectName ?? ""} ${body.projectCategory ?? ""} ${body.templateName ?? ""} ${body.filename ?? ""} ${body.videoText ?? ""}`;
  const rule = NICHE_RULES.find((r) => r.test.test(haystack));
  const promo = isPromoProject(body.projectName, body.projectCategory);

  const overlay = String(body.videoText ?? "").replace(/\s+/g, " ").trim();
  const lead = overlay
    ? overlay.slice(0, 120)
    : rule?.lead ?? "Tem um detalhe aqui que muda tudo se você assistir até o fim";

  const cta = promo
    ? pick(
        [
          "Comenta aí se você já tinha visto algo assim.",
          "Salva pra lembrar desse achado depois.",
          "Marca alguém que ia querer um desses.",
        ],
        seed,
      )
    : pick(FALLBACK_CTAS, seed);

  const caption = `${lead}.`.replace(/\s+/g, " ").slice(0, 260);

  const nicheWords = (body.projectCategory ?? "").split(/[\s,/&-]+/).map(slug).filter((w) => w.length > 2);
  const projWords = (body.projectName ?? "").split(/[\s,/&-]+/).map(slug).filter((w) => w.length > 3);
  const overlayWords = overlay.split(/[\s,.;!?]+/).map(slug).filter((w) => w.length > 4).slice(0, 5);

  const recent = new Set((body.recentHashtags ?? []).map((t) => normalizeTag(t).toLowerCase()));
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
  const fresh = (tags: string[]) => {
    const kept = tags.filter((t) => !recent.has(t.toLowerCase()));
    return kept.length >= 3 ? kept : tags;
  };

  // varia o conjunto amplo entre gerações para não repetir sempre as mesmas
  const rotated = GENERIC_TAGS.slice(seed % GENERIC_TAGS.length).concat(
    GENERIC_TAGS.slice(0, seed % GENERIC_TAGS.length),
  );

  return {
    caption,
    cta,
    hashtags: {
      alcance: fresh(uniq(rotated).slice(0, 6).map((t) => `#${t}`)).slice(0, 5),
      nicho: fresh(uniq([...nicheWords, ...projWords, ...(rule?.tags ?? [])]).slice(0, 7).map((t) => `#${slug(t)}`)).slice(0, 6),
      tema: fresh(uniq([...overlayWords, ...(rule?.tags ?? []).slice(0, 4)]).slice(0, 7).map((t) => `#${slug(t)}`)).slice(0, 6),
    },
  };
}

const GENERIC_RE =
  /^(confira essa promo|produto incr[ií]vel|olha isso|imperd[ií]vel|voc[êe] precisa ver|corre l[áa]|simplesmente perfeito)/i;

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
    const system = buildSystem(body) + (isPromoProject(body.projectName, body.projectCategory) ? PROMO_STRATEGY : "");
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
        const fb = total < 10 ? localFallback(body) : null;
        return json(200, {
          caption,
          cta: cta || localFallback(body).cta,
          hashtags: fb
            ? {
                alcance: Array.from(new Set([...hashtags.alcance, ...fb.hashtags.alcance])).slice(0, 5),
                nicho: Array.from(new Set([...hashtags.nicho, ...fb.hashtags.nicho])).slice(0, 6),
                tema: Array.from(new Set([...hashtags.tema, ...fb.hashtags.tema])).slice(0, 7),
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

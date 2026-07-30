// Motor ÚNICO de análise de vídeo + geração de legenda, CTA e hashtags.
//
// Arquitetura em 2 etapas:
//   ETAPA 1 (VISÃO): a IA "assiste" ao vídeo pelos frames e devolve uma análise
//     estruturada (tema, assunto, contexto, pessoas, objetos, produtos, ambiente,
//     ações, emoções, OCR, sequência de cenas, narrativa e NICHO detectado).
//     O nicho é inferido do conteúdo — não existe lista fixa nem regra por projeto.
//   ETAPA 2 (COPY): a IA escreve legenda + CTA + hashtags usando SOMENTE a análise
//     como fonte de assunto. O projeto entra apenas como tom de voz/identidade.
//
// Validação anti-genérico: se a legenda serviria para qualquer vídeo, é rejeitada
// e regenerada (até 2 tentativas) com instruções mais estritas.
//
// NUNCA falha: sempre responde 200 com { caption, cta, hashtags:{...}, source }.
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
  history?: string[];
  recentHashtags?: string[];
  variationSeed?: number;
};

type Analysis = {
  tema?: string;
  assunto?: string;
  contexto?: string;
  pessoas?: string;
  objetos?: string[];
  produtos?: string[];
  ambiente?: string;
  acoes?: string;
  emocoes?: string;
  ocr?: string[];
  cenas?: string[];
  narrativa?: string;
  nicho?: string;
  subnicho?: string;
  palavras_chave?: string[];
  confianca?: number;
};

const VISION_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-5.4-mini",
];
const TEXT_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-3.1-flash-lite",
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

const slug = (s: string) =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

function framesOf(body: Body): string[] {
  return (Array.isArray(body.frames) ? body.frames : []).filter(
    (f) => typeof f === "string" && f.startsWith("data:image"),
  );
}

// ---------------------------------------------------------------- ETAPA 1: visão

const VISION_SYSTEM = `Você é um analista de vídeo. Sua tarefa NÃO é escrever legenda: é ASSISTIR e DESCREVER com precisão.

Você recebe frames em ordem cronológica de um vídeo curto (Reels/Shorts/TikTok).
Descreva apenas o que é possível observar. Nunca invente marcas, nomes, preços, títulos de filmes, falas ou lugares que não estejam visíveis ou escritos na tela.

Identifique também o NICHO do vídeo a partir do conteúdo observado (exemplos possíveis, mas não limitados a: curiosidades, crimes, acontecimentos, favela/comunidade, notícias, humor, memes, filmes, séries, promoções, marketplaces, maquiagem, moda, tecnologia, fitness, maternidade, pets, decoração, cozinha, automóveis, educação, saúde, finanças, esportes, astronomia, ou qualquer outro).
Não use listas fixas: nomeie o nicho que melhor descreve o conteúdo, mesmo que seja incomum.

Responda SOMENTE JSON válido:
{
 "tema": "tema principal em uma frase",
 "assunto": "o assunto concreto do vídeo (do que ele fala)",
 "contexto": "situação/contexto do que acontece",
 "pessoas": "quantas pessoas, o que fazem, expressões (sem identificar identidades)",
 "objetos": ["objetos visíveis relevantes"],
 "produtos": ["produtos identificáveis, se houver"],
 "ambiente": "onde se passa",
 "acoes": "ação principal do início ao fim",
 "emocoes": "emoção predominante",
 "ocr": ["textos lidos na tela, literalmente"],
 "cenas": ["descrição curta de cada frame na ordem"],
 "narrativa": "a história/arco do vídeo em 1-2 frases",
 "nicho": "nicho identificado a partir do conteúdo",
 "subnicho": "recorte mais específico do nicho",
 "palavras_chave": ["8 a 15 termos concretos extraídos do vídeo"],
 "confianca": 0.0
}
"confianca" é de 0 a 1: quão claro está o conteúdo nos frames.`;

function visionUserParts(body: Body, frames: string[]) {
  const hints = [
    body.videoText ? `Texto sobreposto informado pelo editor: ${body.videoText}` : null,
    body.filename ? `Nome do arquivo: ${body.filename}` : null,
  ].filter(Boolean).join("\n");
  const parts: any[] = [{
    type: "text",
    text: `Analise os frames abaixo, em ordem cronológica, e devolva a análise em JSON.${hints ? `\n\nPistas auxiliares (use apenas se coerentes com as imagens):\n${hints}` : ""}`,
  }];
  for (const f of frames) parts.push({ type: "image_url", image_url: { url: f } });
  return parts;
}

async function analyzeVideo(body: Body, frames: string[]): Promise<Analysis | null> {
  if (!frames.length) return null;
  const messages = [
    { role: "system", content: VISION_SYSTEM },
    { role: "user", content: visionUserParts(body, frames) },
  ];
  for (const model of VISION_MODELS) {
    try {
      const raw = await callAi({
        module: "generate-caption",
        model,
        messages,
        jsonMode: true,
        timeoutMs: 45_000,
        context: { stage: "vision", model, frames: frames.length },
      });
      const parsed = parseModelJson<Analysis>(raw);
      if (parsed && (parsed.assunto || parsed.tema || parsed.narrativa)) return parsed;
    } catch (e) {
      console.warn(JSON.stringify({
        module: "generate-caption", event: "vision_failed", model,
        error: String((e as Error)?.message ?? e),
      }));
    }
  }
  return null;
}

/** Análise mínima derivada do OCR/arquivo quando não há visão disponível. */
function textOnlyAnalysis(body: Body): Analysis {
  const overlay = String(body.videoText ?? "").replace(/\s+/g, " ").trim();
  return {
    tema: overlay || undefined,
    assunto: overlay || undefined,
    ocr: overlay ? [overlay] : [],
    palavras_chave: overlay.split(/[\s,.;!?]+/).filter((w) => w.length > 4).slice(0, 10),
    confianca: overlay ? 0.35 : 0.1,
  };
}

// ---------------------------------------------------------------- ETAPA 2: copy

const HOOK_FORMULAS = [
  "contraste (expectativa vs. o que realmente aparece)",
  "curiosidade (revele parte do detalhe e segure a explicação)",
  "problema concreto que o vídeo resolve ou expõe",
  "detalhe específico que quase ninguém percebe",
  "afirmação forte e defensável sobre o que aparece",
  "pergunta específica sobre a cena, fácil de responder nos comentários",
  "começo no meio da ação, como quem conta um caso",
  "utilidade imediata prometida logo na primeira linha",
];

const CTA_INTENTS = [
  "pedir um comentário respondendo uma pergunta específica sobre o vídeo",
  "incentivar salvar para usar/rever depois",
  "incentivar compartilhar ou marcar alguém ligado ao tema",
  "convidar a rever o detalhe específico da cena",
  "convidar a seguir para mais conteúdos desse assunto",
  "provocar uma escolha entre duas opções vistas no vídeo",
];

const TONES = [
  "conversacional e direto",
  "entusiasmado sem exagero",
  "curioso e investigativo",
  "prático e objetivo",
  "leve e bem-humorado quando o conteúdo permitir",
];

const pickOne = <T,>(a: T[], seed: number) => a[Math.abs(seed) % a.length];

function analysisBlock(a: Analysis) {
  const line = (k: string, v: unknown) => {
    const s = Array.isArray(v) ? arr(v).join(" | ") : String(v ?? "").trim();
    return s ? `${k}: ${s}` : null;
  };
  return [
    line("Tema", a.tema),
    line("Assunto", a.assunto),
    line("Contexto", a.contexto),
    line("Narrativa", a.narrativa),
    line("Ações", a.acoes),
    line("Pessoas", a.pessoas),
    line("Ambiente", a.ambiente),
    line("Objetos", a.objetos),
    line("Produtos", a.produtos),
    line("Emoção", a.emocoes),
    line("Textos na tela (OCR)", a.ocr),
    line("Sequência de cenas", a.cenas),
    line("Nicho detectado", a.nicho),
    line("Subnicho", a.subnicho),
    line("Palavras-chave do vídeo", a.palavras_chave),
  ].filter(Boolean).join("\n");
}

function toneBlock(body: Body) {
  return [
    body.projectName ? `Página/canal: ${body.projectName}` : null,
    body.projectCategory ? `Linha editorial da página: ${body.projectCategory}` : null,
    body.style ? `Tom pedido: ${body.style}` : null,
    Array.isArray(body.history) && body.history.length
      ? `Legendas recentes desta página (NÃO repita estrutura nem frases):\n- ${body.history.slice(0, 8).join("\n- ")}`
      : null,
    Array.isArray(body.recentHashtags) && body.recentHashtags.length
      ? `Hashtags usadas recentemente (troque a maior parte):\n${body.recentHashtags.slice(0, 30).join(" ")}`
      : null,
  ].filter(Boolean).join("\n");
}

function copySystem(seed: number, strict: boolean) {
  const hook = pickOne(HOOK_FORMULAS, seed);
  const ctaIntent = pickOne(CTA_INTENTS, seed >> 3);
  const tone = pickOne(TONES, seed >> 6);

  return `Você é um social media brasileiro sênior. Você acabou de assistir a um vídeo e recebeu a ANÁLISE detalhada dele.

REGRA CENTRAL: o ASSUNTO da legenda nasce SEMPRE da análise do vídeo.
A página/projeto serve APENAS para calibrar linguagem, formalidade e tom de voz — nunca para definir o assunto.
O nicho já foi identificado a partir do conteúdo: use-o para escolher vocabulário e hashtags de comunidade.

LEGENDA:
- Deve provar que quem escreveu assistiu ao vídeo: cite elementos concretos da análise (objeto, ação, cena, texto lido, detalhe do ambiente).
- Gancho na primeira frase, usando a fórmula: ${hook}.
- Depois 1 ou 2 frases de desenvolvimento com informação concreta, benefício ou curiosidade real.
- 2 a 4 frases curtas, até ~300 caracteres, linguagem natural, tom ${tone}.
- Sem clickbait enganoso. Sem hashtags, links, URLs ou @menções dentro da legenda.
- Nunca invente marcas, preços, nomes, títulos ou falas que não estejam na análise.
- PROIBIDO clichê: "Confira essa promoção", "Produto incrível", "Olha isso", "Imperdível", "Você precisa ver", "Corre lá", "Simplesmente perfeito", "conteúdo incrível", "vale a pena conferir".

CTA (campo separado, não repetir dentro da legenda):
- Uma frase curta, específica ao conteúdo do vídeo, com intenção: ${ctaIntent}.

HASHTAGS (12 a 18 no total, todas derivadas do conteúdo do vídeo + nicho identificado):
- "alcance": 3 a 5 amplas/de descoberta.
- "nicho": 4 a 6 do nicho e da comunidade detectada.
- "tema": 4 a 7 específicas do que aparece no vídeo (produto, cena, assunto, palavras-chave).
- Troque a maior parte das hashtags recentes informadas. Cada hashtag começa com # e não tem espaços.

TESTE FINAL OBRIGATÓRIO (faça mentalmente antes de responder):
"Essa legenda poderia servir para qualquer outro vídeo?" Se sim, reescreva até que não sirva.
${strict ? "\nATENÇÃO: a tentativa anterior foi rejeitada por ser genérica. Cite obrigatoriamente pelo menos DOIS elementos concretos e específicos da análise (nomes de objetos, texto lido na tela, ação exata, detalhe do cenário) dentro da legenda." : ""}

Responda SOMENTE JSON válido:
{"nicho":"nicho identificado","caption":"...","cta":"...","hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;
}

async function writeCopy(body: Body, a: Analysis, seed: number, strict: boolean) {
  const messages = [
    { role: "system", content: copySystem(seed, strict) },
    {
      role: "user",
      content: `ANÁLISE DO VÍDEO (fonte única do assunto):\n${analysisBlock(a) || "(análise pobre — seja o mais concreto possível com o que houver)"}\n\nIDENTIDADE DA PÁGINA (apenas tom de voz):\n${toneBlock(body) || "(sem informação — use tom neutro)"}`,
    },
  ];
  for (const model of TEXT_MODELS) {
    try {
      const raw = await callAi({
        module: "generate-caption",
        model,
        messages,
        jsonMode: true,
        timeoutMs: 40_000,
        context: { stage: "copy", model, strict },
      });
      const parsed = parseModelJson<any>(raw);
      if (parsed && String(parsed.caption ?? "").trim()) return { parsed, model };
    } catch (e) {
      console.warn(JSON.stringify({
        module: "generate-caption", event: "copy_failed", model,
        error: String((e as Error)?.message ?? e),
      }));
    }
  }
  return null;
}

// ------------------------------------------------- validação anti-genérico

const CLICHES = [
  "confira essa promo", "produto incrivel", "produto incrível", "olha isso",
  "imperdivel", "imperdível", "voce precisa ver", "você precisa ver", "corre la",
  "corre lá", "simplesmente perfeito", "conteudo incrivel", "conteúdo incrível",
  "vale a pena conferir", "nao vai acreditar", "não vai acreditar",
];

/** Termos concretos extraídos da análise para verificar ancoragem da legenda. */
function anchorTerms(a: Analysis): string[] {
  const raw = [
    ...arr(a.palavras_chave),
    ...arr(a.objetos),
    ...arr(a.produtos),
    ...arr(a.ocr).flatMap((t) => t.split(/\s+/)),
    ...String(a.assunto ?? "").split(/\s+/),
    ...String(a.tema ?? "").split(/\s+/),
    ...String(a.ambiente ?? "").split(/\s+/),
  ];
  const stop = new Set([
    "para", "com", "sobre", "uma", "esse", "essa", "isso", "aqui", "mais", "muito",
    "todo", "toda", "pessoa", "pessoas", "video", "vídeo", "cena", "tela", "coisa",
    "the", "and", "que", "dos", "das", "por", "sem", "sua", "seu",
  ]);
  return Array.from(new Set(raw.map(slug).filter((w) => w.length > 3 && !stop.has(w))));
}

function isGeneric(caption: string, a: Analysis): boolean {
  const c = caption.trim();
  if (c.length < 25) return true;
  const flat = slug(c);
  if (CLICHES.some((x) => flat.includes(slug(x)))) return true;
  const terms = anchorTerms(a);
  if (terms.length < 2) return false; // sem base para julgar
  const hits = terms.filter((t) => flat.includes(t)).length;
  return hits < 1;
}

function hashtagsCoherent(groups: { alcance: string[]; nicho: string[]; tema: string[] }, a: Analysis) {
  const total = groups.alcance.length + groups.nicho.length + groups.tema.length;
  if (total < 8) return false;
  const terms = anchorTerms(a);
  if (terms.length < 2) return true;
  const flat = groups.tema.concat(groups.nicho).map((t) => slug(t)).join(" ");
  return terms.some((t) => flat.includes(t.slice(0, Math.min(t.length, 8))));
}

// ---------------------------------------------------------------- fallback local

const GENERIC_TAGS = [
  "reels", "viral", "fyp", "paravoce", "explorar", "tiktokbrasil",
  "shorts", "trend", "conteudo", "brasil", "descobrindo", "dicas",
];

const FALLBACK_CTAS = [
  "Comenta aí o que você achou disso.",
  "Salva pra não perder esse detalhe depois.",
  "Marca alguém que precisa ver isso.",
  "Assiste de novo e repara no final.",
  "Me conta nos comentários se você faria igual.",
  "Segue aqui pra ver mais sobre esse assunto.",
];

/** Fallback construído a partir da ANÁLISE (não do projeto). */
function localFallback(body: Body, a: Analysis) {
  const seed = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();
  const overlay = arr(a.ocr)[0] ?? String(body.videoText ?? "").trim();
  const subject = String(a.assunto ?? a.tema ?? a.narrativa ?? "").trim();

  const lead = subject
    ? subject.replace(/[.!?]+$/, "")
    : overlay
      ? overlay.slice(0, 120).replace(/[.!?]+$/, "")
      : "Tem um detalhe nesse vídeo que muda tudo se você assistir até o fim";

  const develop = [
    a.acoes ? String(a.acoes).slice(0, 140) : null,
    a.contexto ? String(a.contexto).slice(0, 140) : null,
    a.emocoes ? `A cena entrega ${String(a.emocoes).toLowerCase()} do começo ao fim.` : null,
    "Repara nos detalhes: faz mais sentido vendo até o fim.",
  ].filter(Boolean) as string[];

  const caption = `${lead}. ${pickOne(develop, seed >> 2)}`.replace(/\s+/g, " ").slice(0, 280);
  const cta = pickOne(FALLBACK_CTAS, seed);

  const nicheWords = [a.nicho, a.subnicho].filter(Boolean).flatMap((s) => String(s).split(/[\s,/&-]+/));
  const themeWords = [
    ...arr(a.palavras_chave),
    ...arr(a.produtos),
    ...arr(a.objetos),
  ];

  const recent = new Set((body.recentHashtags ?? []).map((t) => normalizeTag(t).toLowerCase()));
  const fresh = (tags: string[]) => {
    const kept = tags.filter((t) => !recent.has(t.toLowerCase()));
    return kept.length >= 3 ? kept : tags;
  };
  const tag = (list: string[]) =>
    Array.from(new Set(list.map(slug).filter((w) => w.length > 2).map((w) => `#${w}`)));

  const rotated = GENERIC_TAGS.slice(seed % GENERIC_TAGS.length)
    .concat(GENERIC_TAGS.slice(0, seed % GENERIC_TAGS.length));

  return {
    caption,
    cta,
    nicho: a.nicho ?? null,
    hashtags: {
      alcance: fresh(tag(rotated)).slice(0, 5),
      nicho: fresh(tag(nicheWords)).slice(0, 6),
      tema: fresh(tag(themeWords)).slice(0, 7),
    },
  };
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não suportado.", code: "METHOD_NOT_ALLOWED" });

  const startedAt = Date.now();
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch { /* corpo vazio → fallback */ }

  const seed = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();

  try {
    const frames = framesOf(body);

    // ETAPA 1 — assistir ao vídeo
    const vision = await analyzeVideo(body, frames);
    const analysis: Analysis = vision ?? textOnlyAnalysis(body);

    // ETAPA 2 — escrever a partir da análise, com rejeição de genérico
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await writeCopy(body, analysis, seed + attempt * 977, attempt > 0);
      if (!res) break;

      const caption = String(res.parsed.caption ?? "").trim();
      const cta = String(res.parsed.cta ?? "").trim();
      const hashtags = normalizeHashtags(res.parsed.hashtags ?? {});
      const generic = isGeneric(caption, analysis);
      const coherent = hashtagsCoherent(hashtags, analysis);

      if (generic || !coherent) {
        console.warn(JSON.stringify({
          module: "generate-caption", event: "rejected_generic",
          attempt, generic, coherent, model: res.model,
        }));
        if (attempt === 0) continue;
      }

      const fb = (hashtags.alcance.length + hashtags.nicho.length + hashtags.tema.length) < 10
        ? localFallback(body, analysis)
        : null;

      return json(200, {
        caption,
        cta: cta || localFallback(body, analysis).cta,
        hashtags: fb
          ? {
              alcance: Array.from(new Set([...hashtags.alcance, ...fb.hashtags.alcance])).slice(0, 5),
              nicho: Array.from(new Set([...hashtags.nicho, ...fb.hashtags.nicho])).slice(0, 6),
              tema: Array.from(new Set([...hashtags.tema, ...fb.hashtags.tema])).slice(0, 7),
            }
          : hashtags,
        niche: String(res.parsed.nicho ?? analysis.nicho ?? "") || undefined,
        analysis: analysisBlock(analysis),
        analysisJson: analysis,
        model: res.model,
        source: "ai",
        vision: Boolean(vision),
        validated: !generic && coherent,
        ms: Date.now() - startedAt,
      });
    }

    const fb = localFallback(body, analysis);
    console.warn(JSON.stringify({
      module: "generate-caption", event: "local_fallback_used",
      vision: Boolean(vision), frames: frames.length, ms: Date.now() - startedAt,
    }));
    return json(200, {
      ...fb,
      niche: analysis.nicho ?? undefined,
      analysis: analysisBlock(analysis),
      analysisJson: analysis,
      source: "fallback",
      vision: Boolean(vision),
      validated: false,
      ms: Date.now() - startedAt,
    });
  } catch (e) {
    console.error(JSON.stringify({
      module: "generate-caption", event: "unexpected_error",
      error: String((e as Error)?.message ?? e),
    }));
    const fb = localFallback(body, textOnlyAnalysis(body));
    return json(200, { ...fb, source: "fallback", validated: false });
  }
});

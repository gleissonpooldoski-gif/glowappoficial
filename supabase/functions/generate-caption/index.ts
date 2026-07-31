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
import {
  callGeminiWithFallback,
  parseGeminiJson,
  dataUrlToPart,
  GEMINI_MODELS,
  type GeminiPart,
} from "../_shared/gemini.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  videoUrl?: string | null;
  style?: string | null;
  history?: string[];
  recentHashtags?: string[];
  variationSeed?: number;
  videoId?: string | null;
  cacheKey?: string | null;
  noCache?: boolean;
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
  tem_audio?: boolean;
  transcricao?: string;
};

// Motor exclusivo: Google Gemini (API oficial). 2.5 Flash + sucessores compatíveis.
const VISION_MODELS = GEMINI_MODELS;
const TEXT_MODELS = GEMINI_MODELS;

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

const VISION_SYSTEM = `Você é um analista de vídeo. Sua tarefa NÃO é escrever legenda: é ENTENDER o vídeo e devolver a análise em JSON.

Você recebe o vídeo (com áudio) ou frames em ordem cronológica de um vídeo curto (Reels/Shorts/TikTok).

# ORDEM OBRIGATÓRIA DE ANÁLISE
1º ÁUDIO — se houver narração, diálogo, voz, entrevista ou explicação, ele é a PRINCIPAL fonte de contexto.
   Transcreva o que é dito (campo "transcricao") e entenda o assunto a partir da fala. NUNCA ignore a narração.
2º TEXTO NA TELA — legendas, placas, títulos, preços, nomes e frases (OCR). Use para completar o entendimento.
3º ANÁLISE VISUAL — só depois. Descubra O QUE ACONTECEU, qual a história, o contexto, a emoção e o assunto.
Se não houver áudio ("tem_audio": false), entenda o vídeo pelos acontecimentos.
Nunca se limite a descrever cores, enquadramento, iluminação ou posição de objetos.
Pergunte sempre: "o que realmente está acontecendo neste vídeo?"

# BLOCO DE LIMPEZA (PRÉ-PROCESSAMENTO — OBRIGATÓRIO ANTES DE ANALISAR)
IGNORE COMPLETAMENTE tudo que não faz parte do conteúdo real do vídeo:
marca d'água, nome da página, @usuários, usernames, hashtags, legenda da publicação,
descrição do post, comentários, avisos da plataforma, botões da interface, ícones,
contador de curtidas, contador de comentários, horário, data, números aleatórios,
códigos, links, QR Codes, texto parcialmente reconhecido, palavras cortadas,
frases incompletas, caracteres sem sentido, propagandas, textos fixos da página,
logotipos e elementos repetidos.

OCR: use somente frases completas e claramente relacionadas ao conteúdo do vídeo.
Se nada sobrar após a limpeza, devolva "ocr": [].

Nunca invente marcas, nomes, preços, títulos de filmes, falas ou lugares que não estejam no áudio ou na cena.

# NICHO
O nicho deve representar o assunto principal do vídeo, descoberto por você — nunca pelo nome do projeto,
do canal ou de categorias cadastradas. Pode ser qualquer assunto (promoções, curiosidades, filmes, humor,
notícias, favela, culinária, tecnologia, futebol, carros, saúde, astronomia, ciência, educação,
investimentos, animais, ou outro).
Se não for possível identificar com confiança, use "Geral".

Responda SOMENTE JSON válido:
{
 "tem_audio": true,
 "transcricao": "transcrição limpa da narração/diálogo (vazio se não houver áudio)",
 "tema": "tema principal em uma frase",
 "assunto": "o assunto concreto do vídeo (do que ele fala)",
 "contexto": "situação/contexto do que acontece",
 "pessoas": "quantas pessoas, o que fazem, expressões (sem identificar identidades)",
 "objetos": ["objetos relevantes para o assunto"],
 "produtos": ["produtos identificáveis, se houver"],
 "ambiente": "onde se passa",
 "acoes": "o que acontece do início ao fim",
 "emocoes": "emoção predominante",
 "ocr": ["apenas frases completas e limpas lidas na tela"],
 "cenas": ["o que acontece em cada momento, na ordem"],
 "narrativa": "a história/arco do vídeo em 1-2 frases",
 "nicho": "nicho identificado a partir do conteúdo",
 "subnicho": "recorte mais específico do nicho",
 "palavras_chave": ["8 a 15 termos concretos do conteúdo"],
 "confianca": 0.0
}
Sem explicações, sem comentários, sem hashtags, sem marca d'água, sem legenda da publicação.
"confianca" é de 0 a 1: quão claro está o conteúdo.`;

/** Remove ruído de interface/OCR inválido das strings lidas na tela. */
const UI_NOISE = /(curtidas?|likes?|coment[áa]rios?|compartilh|seguir|follow|inscreva|assista|link na bio|arraste|deslize|ver mais|swipe|subscribe|shorts?|reels?|tiktok|instagram|youtube|facebook|kwai)/i;

function cleanOcr(list: unknown): string[] {
  return arr(list)
    .map((t) => String(t).replace(/\s+/g, " ").trim())
    .filter((t) => {
      if (t.length < 8) return false;                    // fragmentos
      if (/^[@#]/.test(t)) return false;                 // usuário / hashtag
      if (/https?:\/\/|www\.|\.com|\.br\b/i.test(t)) return false; // links
      if (/^[\d\s.,:;%/-]+$/.test(t)) return false;      // números/horas/datas
      if (UI_NOISE.test(t)) return false;                // interface/plataforma
      if (!/[aeiouáéíóúâêôãõ]/i.test(t)) return false;   // caracteres sem sentido
      const words = t.split(" ").filter(Boolean);
      if (words.length < 2) return false;                // palavra solta/cortada
      return true;
    })
    .filter((t, i, a) => a.findIndex((o) => deaccent(o) === deaccent(t)) === i)
    .slice(0, 12);
}


function hintsBlock(body: Body): string {
  return [
    body.videoText ? `Texto sobreposto informado pelo editor: ${body.videoText}` : null,
    body.filename ? `Nome do arquivo: ${body.filename}` : null,
  ].filter(Boolean).join("\n");
}

function visionUserParts(body: Body, frames: string[]): GeminiPart[] {
  const hints = hintsBlock(body);
  const parts: GeminiPart[] = [{
    text: `Analise os frames abaixo, em ordem cronológica, e devolva a análise em JSON. Este vídeo veio sem áudio disponível: entenda pelos acontecimentos e pelos textos na tela.${hints ? `\n\nPistas auxiliares (use apenas se coerentes com as imagens):\n${hints}` : ""}`,
  }];
  for (const f of frames) {
    const part = dataUrlToPart(f);
    if (part) parts.push(part);
  }
  return parts;
}

const MAX_INLINE_VIDEO = 18 * 1024 * 1024; // limite seguro para inline_data

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Baixa o vídeo processado para enviar ao Gemini COM ÁUDIO. Null se inviável. */
async function fetchVideoPart(url: string): Promise<GeminiPart | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > MAX_INLINE_VIDEO) {
      console.info(JSON.stringify({ module: "generate-caption", event: "video_too_large", bytes: len }));
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_INLINE_VIDEO) return null;
    const mime = (res.headers.get("content-type") ?? "video/mp4").split(";")[0] || "video/mp4";
    return { inline_data: { mime_type: mime.startsWith("video/") ? mime : "video/mp4", data: toBase64(buf) } };
  } catch (e) {
    console.warn(JSON.stringify({ module: "generate-caption", event: "video_fetch_failed", error: String(e) }));
    return null;
  }
}

function normalizeAnalysis(parsed: any): Analysis | null {
  if (!parsed || !(parsed.assunto || parsed.tema || parsed.narrativa)) return null;
  parsed.ocr = cleanOcr(parsed.ocr);
  parsed.transcricao = String(parsed.transcricao ?? "").replace(/\s+/g, " ").trim();
  parsed.tem_audio = Boolean(parsed.tem_audio) && parsed.transcricao.length > 0;
  const n = String(parsed.nicho ?? "").trim();
  if (!n || /^[@#]/.test(n)) parsed.nicho = "geral";
  return parsed as Analysis;
}

/**
 * AGENTE 1 — Analista de Vídeo (Gemini).
 * Prioridade: vídeo completo (áudio + imagem). Se o arquivo for grande ou
 * indisponível, cai para os frames enviados pelo cliente.
 */
async function analyzeVideo(body: Body, frames: string[]): Promise<Analysis | null> {
  const run = async (parts: GeminiPart[], mode: "video_audio" | "frames") => {
    const { text } = await callGeminiWithFallback({
      module: "generate-caption",
      stage: "vision",
      models: VISION_MODELS,
      system: VISION_SYSTEM,
      parts,
      json: true,
      temperature: 0.4,
      timeoutMs: mode === "video_audio" ? 120_000 : 60_000,
      context: { mode, frames: frames.length },
    });
    return normalizeAnalysis(parseGeminiJson<any>(text));
  };

  // 1) vídeo completo com áudio
  if (body.videoUrl) {
    try {
      const videoPart = await fetchVideoPart(String(body.videoUrl));
      if (videoPart) {
        const hints = hintsBlock(body);
        const parsed = await run([
          { text: `Assista ao vídeo abaixo. Comece pelo ÁUDIO (transcreva a narração/diálogo), depois os textos na tela e só então os acontecimentos visuais. Devolva a análise em JSON.${hints ? `\n\nPistas auxiliares:\n${hints}` : ""}` },
          videoPart,
        ], "video_audio");
        if (parsed) {
          console.info(JSON.stringify({
            module: "generate-caption", event: "vision_ok", mode: "video_audio",
            tem_audio: parsed.tem_audio ?? false, transcricao_chars: (parsed.transcricao ?? "").length,
          }));
          return parsed;
        }
      }
    } catch (e) {
      console.warn(JSON.stringify({
        module: "generate-caption", event: "vision_video_failed",
        error: String((e as Error)?.message ?? e),
      }));
    }
  }

  // 2) fallback: frames
  if (!frames.length) return null;
  try {
    return await run(visionUserParts(body, frames), "frames");
  } catch (e) {
    console.warn(JSON.stringify({
      module: "generate-caption", event: "vision_failed",
      error: String((e as Error)?.message ?? e),
    }));
  }
  return null;
}

// ------------------------------------------------- análise heurística (sem IA)
// Usada quando a etapa de visão não está disponível (ex.: gateway 402/timeout).
// Extrai assunto, palavras-chave e nicho de tudo que o app já conhece do vídeo:
// texto sobreposto (OCR do editor), nome do arquivo, template e linha editorial.

const STOPWORDS = new Set([
  "para", "com", "sobre", "uma", "esse", "essa", "isso", "aqui", "mais", "muito",
  "todo", "toda", "pessoa", "pessoas", "video", "videos", "cena", "tela", "coisa",
  "final", "mp4", "mov", "webm", "reels", "short", "shorts", "export", "render",
  "copia", "copy", "novo", "nova", "the", "and", "que", "dos", "das", "por", "sem",
  "sua", "seu", "pra", "quando", "porque", "depois", "antes", "onde", "como", "isto",
]);

const deaccent = (s: string) =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function keywordsFrom(text: string, limit = 14): string[] {
  return Array.from(
    new Set(
      deaccent(text)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !BANNED_TAGS.has(w)),
    ),
  ).slice(0, limit);
}

/** Deduz o nicho a partir do banco interno de assuntos. */
function inferNiche(hay: string): { nicho?: string; subnicho?: string } {
  const flat = slug(hay);
  const hits: string[] = [];
  for (const entry of HASHTAG_BANK) {
    const k = entry.keys.find((key) => flat.includes(slug(key)));
    if (k) hits.push(k);
  }
  return { nicho: hits[0], subnicho: hits[1] };
}

/** Análise derivada de OCR/arquivo quando não há visão de IA disponível.
 *  O PROJETO nunca entra aqui: ele é identidade (tom/marca), nunca o assunto. */
function heuristicAnalysis(body: Body): Analysis {
  const overlay = String(body.videoText ?? "").replace(/\s+/g, " ").trim();
  const fileWords = String(body.filename ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .trim();

  const hay = [overlay, fileWords].filter(Boolean).join(" ");
  const { nicho, subnicho } = inferNiche(hay);

  const kws = Array.from(new Set([
    ...keywordsFrom(overlay, 12),
    ...keywordsFrom(fileWords, 6),
  ])).slice(0, 15);

  const assunto = overlay || fileWords || "";


  return {
    tema: assunto || undefined,
    assunto: assunto || undefined,
    ocr: overlay ? [overlay] : [],
    nicho,
    subnicho,
    palavras_chave: kws,
    confianca: overlay ? 0.4 : kws.length ? 0.25 : 0.1,
  };
}


// ---------------------------------------------------------------- ETAPA 2: copy

const TITLE_MODELS_HINT = [
  "Será que isso termina bem?",
  "Ninguém esperava esse final...",
  "Olha o que aconteceu logo depois...",
  "Você teria coragem?",
  "O detalhe que quase ninguém percebeu...",
  "Isso quase terminou em tragédia...",
];

const HOOK_FORMULAS = [
  "contraste (expectativa vs. o que realmente aparece)",
  "curiosidade (revele parte do detalhe e segure a explicação)",
  "tensão (algo está prestes a acontecer e o leitor precisa ver)",
  "detalhe específico que quase ninguém percebe",
  "afirmação forte e defensável sobre o que aparece",
  "começo no meio da ação, como quem conta um caso",
  "pergunta direta que só o vídeo responde",
];

const CTA_POOL = [
  "Você faria o mesmo?",
  "O que você acha disso?",
  "Qual seria a sua reação?",
  "Conta aqui nos comentários.",
  "Marca alguém que precisa ver.",
  "Salva esse vídeo pra rever depois.",
  "Você tinha percebido esse detalhe?",
  "Comenta o que você faria no lugar dele.",
  "Assiste de novo e repara no final.",
];

const TONES = [
  "conversacional e direto",
  "tenso e envolvente quando o conteúdo permitir",
  "curioso e investigativo",
  "prático e objetivo",
  "leve e bem-humorado quando o conteúdo permitir",
];

const pickOne = <T,>(a: T[], seed: number) => a[Math.abs(seed) % a.length];

// ------------------------------------------------- banco interno de hashtags

/** Hashtags proibidas por padrão (só entram se a IA justificar pelo tema). */
const BANNED_TAGS = new Set([
  "fyp", "viral", "paravoce", "reels", "explore", "explorar", "trending", "trend",
  "shorts", "tiktokbrasil", "descobrindo", "dicas", "conteudo", "foryou", "foryoupage",
]);

/** Banco de hashtags por assunto — a escolha é feita pelo tema detectado. */
const HASHTAG_BANK: Array<{ keys: string[]; tags: string[] }> = [
  { keys: ["favela", "comunidade", "quebrada", "periferia"], tags: ["#favela","#comunidade","#quebrada","#realidade","#cotidiano","#acontecimentos","#periferia","#brasil","#historia","#momento"] },
  { keys: ["crime", "policial", "policia", "assalto", "roubo", "violencia"], tags: ["#crime","#plantao","#policial","#ocorrencia","#noticias","#seguranca","#casoreal","#investigacao","#justica"] },
  { keys: ["noticia", "noticias", "acontecimento", "jornal", "urgente"], tags: ["#noticias","#plantao","#informacao","#acontecimentos","#atualidades","#brasil","#urgente","#imprensa"] },
  { keys: ["curiosidade", "curiosidades", "fato", "fatos", "voce sabia"], tags: ["#curiosidades","#fatoscuriosos","#vocesabia","#descobertas","#conhecimento","#aprender","#informacao","#mundoafora"] },
  { keys: ["ciencia", "biologia", "natureza", "animal", "animais", "experimento"], tags: ["#ciencia","#biologia","#natureza","#mundoanimal","#experimento","#descobertas","#conhecimento","#curiosidades"] },
  { keys: ["astronomia", "espaco", "universo", "planeta", "nasa"], tags: ["#astronomia","#espaco","#universo","#planetas","#cosmos","#ciencia","#nasa","#estrelas"] },
  { keys: ["filme", "filmes", "cinema", "serie", "series", "cena"], tags: ["#filmes","#cinema","#series","#cenas","#filmedodia","#movie","#cinemabr","#recomendacao"] },
  { keys: ["suspense", "terror", "acao", "drama", "comedia"], tags: ["#suspense","#terror","#acao","#drama","#comedia","#cinema","#filmes"] },
  { keys: ["promocao", "oferta", "desconto", "cupom", "achadinho", "shopee", "amazon", "mercado livre", "marketplace"], tags: ["#promocao","#oferta","#desconto","#achadinhos","#ofertadodia","#cupom","#economizar","#produto","#shopee","#amazon","#mercadolivre"] },
  { keys: ["maquiagem", "make", "beleza", "skincare", "cabelo"], tags: ["#maquiagem","#beleza","#make","#skincare","#autocuidado","#cabelo","#resenha"] },
  { keys: ["moda", "look", "roupa", "estilo"], tags: ["#moda","#look","#estilo","#lookdodia","#tendencia","#roupas"] },
  { keys: ["tecnologia", "celular", "gadget", "computador", "app", "ia"], tags: ["#tecnologia","#gadgets","#celular","#inovacao","#techbr","#novidades"] },
  { keys: ["fitness", "treino", "academia", "musculacao", "corrida"], tags: ["#fitness","#treino","#academia","#musculacao","#saude","#disciplina"] },
  { keys: ["maternidade", "bebe", "filho", "gravidez"], tags: ["#maternidade","#bebe","#maternidadereal","#filhos","#gravidez","#familia"] },
  { keys: ["pet", "pets", "cachorro", "gato"], tags: ["#pets","#cachorro","#gatos","#petlovers","#animais","#fofura"] },
  { keys: ["decoracao", "casa", "organizacao", "reforma"], tags: ["#decoracao","#casa","#organizacao","#interiores","#reforma","#lardocelar"] },
  { keys: ["cozinha", "receita", "comida", "culinaria"], tags: ["#receita","#culinaria","#comida","#cozinha","#receitafacil","#gastronomia"] },
  { keys: ["carro", "carros", "automovel", "moto"], tags: ["#carros","#automoveis","#motor","#velocidade","#carroslegais","#moto"] },
  { keys: ["educacao", "estudo", "escola", "concurso"], tags: ["#educacao","#estudos","#aprender","#conhecimento","#escola","#dicasdeestudo"] },
  { keys: ["saude", "medicina", "medico", "doenca"], tags: ["#saude","#medicina","#bemestar","#cuidados","#prevencao"] },
  { keys: ["financas", "dinheiro", "investimento", "economia"], tags: ["#financas","#dinheiro","#investimentos","#educacaofinanceira","#economia"] },
  { keys: ["esporte", "futebol", "jogo", "time"], tags: ["#futebol","#esporte","#jogo","#torcida","#lance","#brasileirao"] },
  { keys: ["humor", "meme", "engracado", "piada"], tags: ["#humor","#memes","#engracado","#risadas","#comedia"] },
  { keys: ["historia", "historias", "relato", "caso"], tags: ["#historiareal","#relato","#caso","#historias","#acontecimentos","#emocionante"] },
  { keys: ["game", "games", "jogo eletronico", "gameplay"], tags: ["#games","#gameplay","#gamer","#jogos","#gamingbr"] },
];

function bankTagsFor(a: Analysis, seed: number): string[] {
  const hay = slug([
    a.nicho, a.subnicho, a.tema, a.assunto, a.contexto, a.narrativa, a.ambiente,
    arr(a.palavras_chave).join(" "), arr(a.objetos).join(" "), arr(a.produtos).join(" "),
  ].filter(Boolean).join(" "));

  const matched: string[] = [];
  for (const entry of HASHTAG_BANK) {
    if (entry.keys.some((k) => hay.includes(slug(k)))) {
      const rot = entry.tags.slice(seed % entry.tags.length).concat(entry.tags.slice(0, seed % entry.tags.length));
      matched.push(...rot);
    }
  }
  return Array.from(new Set(matched));
}

/** Hashtags derivadas diretamente do conteúdo observado. */
function contentTags(a: Analysis): string[] {
  const words = [
    ...arr(a.palavras_chave),
    ...arr(a.produtos),
    ...arr(a.objetos),
    ...String(a.subnicho ?? "").split(/[\s,/&-]+/),
    ...String(a.nicho ?? "").split(/[\s,/&-]+/),
  ];
  return Array.from(
    new Set(words.map(slug).filter((w) => w.length > 3 && !BANNED_TAGS.has(w)).map((w) => `#${w}`)),
  );
}

function stripBanned(tags: string[]) {
  return tags.filter((t) => !BANNED_TAGS.has(slug(t)));
}

function analysisBlock(a: Analysis) {
  const line = (k: string, v: unknown) => {
    const s = Array.isArray(v) ? arr(v).join(" | ") : String(v ?? "").trim();
    return s ? `${k}: ${s}` : null;
  };
  return [
    line("Transcrição do áudio (fonte principal)", a.transcricao),
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

/** Identidade da página: SOMENTE tom de voz e marca. Nunca define o assunto. */
function toneBlock(body: Body) {
  const identity = [body.projectName, body.projectCategory].filter(Boolean).join(" · ");
  return [
    identity
      ? `IDENTIDADE DA PÁGINA (apenas tom de voz / marca): ${identity}\n` +
        `ATENÇÃO: essa identidade NÃO é o assunto do vídeo. O assunto vem exclusivamente da análise do vídeo (áudio, textos na tela, cenas). ` +
        `Nunca escreva sobre a página, o projeto ou a categoria.`
      : null,
    body.style ? `Tom pedido: ${body.style}` : null,
    Array.isArray(body.history) && body.history.length
      ? `Legendas recentes desta página (NÃO repita estrutura nem frases):\n- ${body.history.slice(0, 8).join("\n- ")}`
      : null,
    Array.isArray(body.recentHashtags) && body.recentHashtags.length
      ? `Hashtags usadas recentemente (troque a maior parte):\n${body.recentHashtags.slice(0, 30).join(" ")}`
      : null,
  ].filter(Boolean).join("\n");
}


function copySystem(seed: number, strict: boolean, bank: string[]) {
  const hook = pickOne(HOOK_FORMULAS, seed);
  const ctaExamples = [pickOne(CTA_POOL, seed), pickOne(CTA_POOL, seed >> 2), pickOne(CTA_POOL, seed >> 4)];
  const tone = pickOne(TONES, seed >> 6);
  const titleExample = pickOne(TITLE_MODELS_HINT, seed >> 1);

  return `Você é um social media brasileiro que cuida de páginas virais com milhões de visualizações. Você acabou de ASSISTIR ao vídeo e recebeu a ANÁLISE dele.

Você NÃO descreve o vídeo. Você NÃO resume o vídeo. Você escreve um texto que faz a pessoa querer assistir, comentar, compartilhar e salvar.

REGRA CENTRAL: o assunto nasce SEMPRE da análise do vídeo. A página/projeto só calibra linguagem e tom de voz — nunca define o assunto. O nicho é o que a análise identificou, seja ele qual for.

ESTRUTURA OBRIGATÓRIA DA LEGENDA (campo "caption"), exatamente nesta ordem, em UM único bloco de texto:
1) GANCHO — primeira frase forte: pergunta, curiosidade ou situação que prenda de imediato. Fórmula desta vez: ${hook}. Pode terminar com no máximo 1 emoji.
2) CONTEXTO — 2 a 3 frases curtas ligadas EXATAMENTE ao que aparece no vídeo (ação, objeto em foco, reação, cena, texto lido na tela). Sem inventar fatos, sem exagerar, sem frase que sirva para outro vídeo.
Não inclua o CTA aqui — ele vai no campo separado.
Tom ${tone}. Português brasileiro coloquial, como página grande escreve. Sem hashtags, links, URLs ou @menções dentro da legenda. No máximo 2 emojis no total.

Referência de energia do gancho (NÃO copie): "O que você faria nessa situação? 😳" / "Você teria coragem de passar por isso?" / "Olha o que aconteceu logo depois..." / "Imagina encontrar isso..." / "${titleExample}".

CTA (campo separado): uma frase curta e natural que puxe comentário/compartilhamento/salvamento. Varie sempre, nunca repita o mesmo padrão. Exemplos de energia: ${ctaExamples.join(" / ")}.

TÍTULO (campo "title"): frase curta (até ~60 caracteres) usada internamente. Chamativa, específica deste vídeo, nunca descritiva.

HASHTAGS — 12 a 20 no total, TODAS nascidas do conteúdo identificado (áudio/narração, assunto, contexto, objeto, ação, categoria, emoção, nicho):
- NÃO use por padrão hashtags vazias de plataforma (#fyp, #viral, #paravoce, #reels, #explore, #trending, #shorts, #foryou, #dicas, #conteudo) — somente se fizerem sentido real para este conteúdo.
- Misture tamanhos: amplas (do tema), médias (do nicho/comunidade) e específicas (do que literalmente acontece no vídeo).
- "alcance": 3 a 5 amplas do TEMA (ex.: #humor, #noticias, #cinema, #promocao).
- "nicho": 4 a 7 da comunidade do nicho detectado.
- "tema": 5 a 8 específicas do conteúdo (assunto falado, objeto, ação, reação, palavras-chave, emoção).
- Podem ser em CamelCase quando ficar natural (ex.: #ReacaoInesperada, #SituacaoEngracada).
- Devem parecer escolhidas por um social media experiente, nunca genéricas.
- Troque a maior parte das hashtags usadas recentemente.
${bank.length ? `- Banco sugerido para este tema (use as que fizerem sentido e acrescente outras específicas): ${bank.slice(0, 28).join(" ")}` : ""}

VALIDAÇÃO ANTES DE RESPONDER — se qualquer resposta for "não", reescreva antes de devolver:
- A legenda demonstra que você assistiu ao vídeo (cita elementos concretos)?
- O gancho desperta curiosidade real?
- O CTA incentiva comentários de forma natural?
- As hashtags pertencem exatamente a este conteúdo?
- O texto parece escrito à mão por um social media profissional (e não por IA)?
- Essa legenda poderia ser usada em OUTRO vídeo? Se sim, está errada.

PROIBIDO — descrição visual em vez de copywriting. Nunca escreva: "o vídeo mostra...", "é possível ver...", "na imagem...", "há um homem...", "aparece uma...", nem descrever cores, enquadramento, iluminação ou posição de objetos.
PROIBIDO também: descrições técnicas, textos institucionais, "Confira", "Olha esse vídeo", "Imperdível", "Você precisa ver", "Vale a pena conferir", "Produto incrível".
Se houver transcrição do áudio, o assunto da legenda deve nascer do que foi DITO no vídeo.
${strict ? "\nATENÇÃO: a tentativa anterior foi rejeitada por ser genérica. Cite obrigatoriamente DOIS elementos concretos da análise no texto e use hashtags específicas do assunto." : ""}

Responda SOMENTE JSON válido:
{"nicho":"nicho identificado","title":"...","caption":"gancho + contexto","cta":"...","hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;
}


/** AGENTE 2 — Copywriter Viral (Gemini, texto). Recebe SÓ o JSON da análise. */
async function writeCopy(body: Body, a: Analysis, seed: number, strict: boolean) {
  const bank = bankTagsFor(a, seed);
  const userText = `ANÁLISE DO VÍDEO EM JSON (fonte única do assunto — você NÃO viu o vídeo, confie apenas nisto):
${JSON.stringify(a)}

RESUMO LEGÍVEL:
${analysisBlock(a) || "(análise pobre — seja o mais concreto possível com o que houver)"}

IDENTIDADE DA PÁGINA (apenas tom de voz):
${toneBlock(body) || "(sem informação — use tom neutro)"}`;
  try {
    const { text, model } = await callGeminiWithFallback({
      module: "generate-caption",
      stage: "copy",
      models: TEXT_MODELS,
      system: copySystem(seed, strict, bank),
      parts: [{ text: userText }],
      json: true,
      temperature: strict ? 0.7 : 1.0,
      timeoutMs: 45_000,
      context: { strict },
    });
    const parsed = parseGeminiJson<any>(text);
    if (parsed && String(parsed.caption ?? "").trim()) return { parsed, model };
  } catch (e) {
    console.warn(JSON.stringify({
      module: "generate-caption", event: "copy_failed",
      error: String((e as Error)?.message ?? e),
    }));
  }
  return null;
}

// ------------------------------------------------- validação anti-genérico

const CLICHES = [
  "confira essa promo", "confira isso", "produto incrivel", "produto incrível", "olha isso",
  "olha esse video", "olha esse vídeo", "veja essa promocao", "veja essa promoção",
  "imperdivel", "imperdível", "voce precisa ver", "você precisa ver", "corre la",
  "corre lá", "simplesmente perfeito", "conteudo incrivel", "conteúdo incrível",
  "vale a pena conferir", "nao vai acreditar", "não vai acreditar", "nesse video voce ve",
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
  const all = groups.alcance.concat(groups.nicho, groups.tema);
  if (all.some((t) => BANNED_TAGS.has(slug(t)))) return false;
  const terms = anchorTerms(a).concat(bankTagsFor(a, 0).map((t) => slug(t)));
  if (terms.length < 2) return true;
  const flat = all.map((t) => slug(t)).join(" ");
  return terms.some((t) => flat.includes(t.slice(0, Math.min(t.length, 8))));
}

// ---------------------------------------------------------------- fallback local

const FALLBACK_TITLES = [
  "Ninguém esperava esse final...",
  "Repara no detalhe que aparece no fim",
  "Isso muda tudo quando você entende",
  "Você teria coragem?",
  "O detalhe que quase ninguém percebeu",
  "Olha o que aconteceu logo depois...",
];

/** Fallback construído a partir da ANÁLISE (não do projeto). */
function localFallback(body: Body, a: Analysis, seedOverride?: number) {
  const seed = Number.isFinite(seedOverride)
    ? Number(seedOverride)
    : Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();

  const overlay = arr(a.ocr)[0] ?? String(body.videoText ?? "").trim();

  const HOOKS = [
    "O que você faria numa situação dessas? 😳",
    "Você teria coragem de passar por isso?",
    "Olha o que aconteceu logo depois...",
    "Imagina se isso acontecesse com você...",
    "Repara no detalhe que aparece no fim 👀",
    "Ninguém esperava esse desfecho...",
  ];
  const hook = pickOne(HOOKS, seed >> 3);

  const subject = String(a.assunto ?? a.tema ?? a.narrativa ?? "").trim();
  const seen = new Set<string>();
  const uniq = (s: string | null) => {
    if (!s) return null;
    const k = slug(s);
    if (!k || seen.has(k)) return null;
    seen.add(k);
    return s;
  };
  const contextParts = [
    uniq(subject ? subject.replace(/[.!?]+$/, "") + "." : null),
    uniq(a.acoes ? String(a.acoes).replace(/[.!?]+$/, "").slice(0, 140) + "." : null),
    uniq(a.contexto ? String(a.contexto).replace(/[.!?]+$/, "").slice(0, 140) + "." : null),
    uniq(a.emocoes ? `A reação diz tudo: ${String(a.emocoes).toLowerCase()}.` : null),
    uniq(overlay && !slug(subject).includes(slug(overlay)) ? `Na tela: "${overlay.slice(0, 80)}".` : null),
  ].filter(Boolean) as string[];


  const context = (contextParts.length
    ? contextParts.slice(0, 3).join(" ")
    : "Tem um detalhe nessa cena que só faz sentido quando você assiste até o fim.");

  const caption = `${hook} ${context}`.replace(/\s+/g, " ").slice(0, 420);
  const cta = pickOne(CTA_POOL, seed);
  const title = pickOne(FALLBACK_TITLES, seed >> 5);


  const recent = new Set((body.recentHashtags ?? []).map((t) => normalizeTag(t).toLowerCase()));
  const fresh = (tags: string[]) => {
    const kept = tags.filter((t) => !recent.has(t.toLowerCase()));
    return kept.length >= 3 ? kept : tags;
  };

  const bank = stripBanned(bankTagsFor(a, seed));
  const specific = stripBanned(contentTags(a));
  const nicheWords = stripBanned(
    Array.from(new Set(
      [a.nicho, a.subnicho].filter(Boolean)
        .flatMap((s) => String(s).split(/[\s,/&-]+/))
        .map(slug).filter((w) => w.length > 2).map((w) => `#${w}`),
    )),
  );

  const take = (list: string[], n: number, used: Set<string>) => {
    const out: string[] = [];
    for (const t of list) {
      if (out.length >= n) break;
      const k = t.toLowerCase();
      if (used.has(k)) continue;
      used.add(k);
      out.push(t);
    }
    return out;
  };
  const used = new Set<string>();
  const alcance = take(fresh(bank), 7, used);
  const nicho = take(fresh([...nicheWords, ...bank]), 9, used);
  const tema = take(fresh([...specific, ...bank]), 10, used);


  return {
    title,
    caption,
    cta,
    nicho: a.nicho ?? null,
    hashtags: { alcance, nicho, tema },
  };
}

/**
 * Fallback INTELIGENTE: gera várias variações a partir da análise, aplica as
 * mesmas validações de qualidade da IA (ancoragem no vídeo, clichês, coerência
 * de hashtags) e devolve a melhor. Nunca entrega texto genérico se houver
 * qualquer elemento concreto do vídeo disponível.
 */
function smartFallback(body: Body, a: Analysis) {
  const base = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();
  const terms = anchorTerms(a);

  let best: ReturnType<typeof localFallback> | null = null;
  let bestScore = -Infinity;
  let bestMeta = { attempt: 0, generic: true, coherent: false, anchors: 0 };

  for (let i = 0; i < 4; i++) {
    const cand = localFallback(body, a, base + i * 613);
    const tags = cand.hashtags.alcance.concat(cand.hashtags.nicho, cand.hashtags.tema);
    const flat = slug(`${cand.caption} ${tags.join(" ")}`);
    const anchors = terms.filter((t) => flat.includes(t)).length;
    const generic = isGeneric(cand.caption, a);
    const coherent = hashtagsCoherent(cand.hashtags, a);

    const score =
      anchors * 10 +
      tags.length +
      (generic ? -40 : 0) +
      (coherent ? 15 : 0) +
      (cand.caption.length > 90 ? 5 : 0);

    if (score > bestScore) {
      best = cand;
      bestScore = score;
      bestMeta = { attempt: i, generic, coherent, anchors };
    }
    if (!generic && coherent && anchors >= 1) break;
  }

  return { ...(best as ReturnType<typeof localFallback>), quality: { ...bestMeta, score: bestScore } };
}

// ---------------------------------------------------------------- handler



// ------------------------------------------------- CACHE inteligente por vídeo

function db() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function cacheKeyOf(body: Body): string | null {
  if (body.noCache) return null;
  if (body.cacheKey) return String(body.cacheKey);
  if (body.videoId) return `video:${body.videoId}`;
  return null;
}

async function readCache(key: string) {
  const c = db();
  if (!c) return null;
  try {
    const { data } = await c.from("video_ai_cache").select("*").eq("cache_key", key).maybeSingle();
    if (!data || !String((data as any).caption ?? "").trim()) return null;
    return data as any;
  } catch { return null; }
}

async function writeCache(key: string, body: Body, a: Analysis, payload: any, model: string) {
  const c = db();
  if (!c) return;
  try {
    await c.from("video_ai_cache").upsert({
      cache_key: key,
      video_id: body.videoId ?? null,
      analysis: a as any,
      summary: analysisBlock(a),
      objects: arr(a.objetos).slice(0, 20),
      ocr: arr(a.ocr).slice(0, 20),
      niche: a.nicho ?? null,
      title: payload.title ?? null,
      caption: payload.caption ?? null,
      cta: payload.cta ?? null,
      hashtags: payload.hashtags ?? null,
      model,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  } catch (e) {
    console.warn(JSON.stringify({ module: "generate-caption", event: "cache_write_failed", error: String(e) }));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não suportado.", code: "METHOD_NOT_ALLOWED" });

  const startedAt = Date.now();
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch { /* corpo vazio → fallback */ }

  const seed = Number.isFinite(body.variationSeed) ? Number(body.variationSeed) : Date.now();

  const cacheKey = cacheKeyOf(body);
  if (cacheKey) {
    const hit = await readCache(cacheKey);
    if (hit) {
      console.info(JSON.stringify({
        module: "generate-caption", event: "cache_hit",
        cache_key: cacheKey, model: hit.model ?? null, ms: Date.now() - startedAt,
      }));
      return json(200, {
        title: hit.title ?? "",
        caption: hit.caption,
        cta: hit.cta ?? "",
        hashtags: hit.hashtags ?? { alcance: [], nicho: [], tema: [] },
        niche: hit.niche ?? undefined,
        analysis: hit.summary ?? "",
        analysisJson: hit.analysis ?? undefined,
        model: hit.model ?? undefined,
        source: "ai",
        cached: true,
        validated: true,
        ms: Date.now() - startedAt,
      });
    }
  }

  try {
    const frames = framesOf(body);

    // ETAPA 1 — assistir ao vídeo
    const vision = await analyzeVideo(body, frames);
    const analysis: Analysis = vision ?? heuristicAnalysis(body);
    console.info(JSON.stringify({
      module: "generate-caption", event: "analysis_ready",
      vision: Boolean(vision), source: vision ? "ai_vision" : "heuristic",
      frames: frames.length, nicho: analysis.nicho ?? null,
      keywords: arr(analysis.palavras_chave).slice(0, 10),
      confianca: analysis.confianca ?? null,
    }));

    // ETAPA 2 — escrever a partir da análise, com rejeição de genérico
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await writeCopy(body, analysis, seed + attempt * 977, attempt > 0);
      if (!res) break;

      const caption = String(res.parsed.caption ?? "").trim();
      const cta = String(res.parsed.cta ?? "").trim();
      const raw = normalizeHashtags(res.parsed.hashtags ?? {});
      const hashtags = {
        alcance: stripBanned(raw.alcance),
        nicho: stripBanned(raw.nicho),
        tema: stripBanned(raw.tema),
      };
      const generic = isGeneric(caption, analysis);
      const coherent = hashtagsCoherent(hashtags, analysis);

      if (generic || !coherent) {
        console.warn(JSON.stringify({
          module: "generate-caption", event: "rejected_generic",
          attempt, generic, coherent, model: res.model,
        }));
        if (attempt === 0) continue;
      }

      const fbLocal = smartFallback(body, analysis);
      const needsTags = (hashtags.alcance.length + hashtags.nicho.length + hashtags.tema.length) < 12;

      // 12 a 20 hashtags no total, sem duplicatas entre os grupos.
      const merged = needsTags
        ? {
            alcance: Array.from(new Set([...hashtags.alcance, ...fbLocal.hashtags.alcance])),
            nicho: Array.from(new Set([...hashtags.nicho, ...fbLocal.hashtags.nicho])),
            tema: Array.from(new Set([...hashtags.tema, ...fbLocal.hashtags.tema])),
          }
        : hashtags;
      const seenTag = new Set<string>();
      const capGroup = (list: string[], max: number) => {
        const out: string[] = [];
        for (const t of list) {
          const k = slug(t);
          if (!k || seenTag.has(k) || out.length >= max) continue;
          seenTag.add(k);
          out.push(t);
        }
        return out;
      };
      const finalTags = {
        alcance: capGroup(merged.alcance, 5),
        nicho: capGroup(merged.nicho, 7),
        tema: capGroup(merged.tema, 8),
      };

      console.info(JSON.stringify({
        module: "generate-caption", event: "caption_delivered",
        version: "ai", model: res.model, attempt, generic, coherent,
        vision: Boolean(vision), audio: Boolean(analysis.tem_audio), chars: caption.length,
        tags: finalTags.alcance.length + finalTags.nicho.length + finalTags.tema.length,
        ms: Date.now() - startedAt,
      }));

      const payload = {
        title: String(res.parsed.title ?? "").trim() || fbLocal.title,
        caption,
        cta: cta || fbLocal.cta,
        hashtags: finalTags,
        niche: String(res.parsed.nicho ?? analysis.nicho ?? "") || undefined,
        analysis: analysisBlock(analysis),
        analysisJson: analysis,
        model: res.model,
        source: "ai",
        vision: Boolean(vision),
        validated: !generic && coherent,
        ms: Date.now() - startedAt,
      };
      if (cacheKey && !generic && coherent) await writeCache(cacheKey, body, analysis, payload, res.model);
      return json(200, payload);
    }

    const fb = smartFallback(body, analysis);
    console.warn(JSON.stringify({
      module: "generate-caption", event: "local_fallback_used",
      version: "fallback_inteligente",
      reason: vision ? "copy_stage_unavailable" : "vision_and_copy_unavailable",
      analysis_source: vision ? "ai_vision" : "heuristic",
      quality: fb.quality, nicho: analysis.nicho ?? null,
      frames: frames.length, ms: Date.now() - startedAt,
    }));
    return json(200, {
      ...fb,
      niche: analysis.nicho ?? undefined,
      analysis: analysisBlock(analysis),
      analysisJson: analysis,
      source: "fallback",
      vision: Boolean(vision),
      validated: !fb.quality.generic && fb.quality.coherent,
      ms: Date.now() - startedAt,
    });

  } catch (e) {
    console.error(JSON.stringify({
      module: "generate-caption", event: "unexpected_error",
      error: String((e as Error)?.message ?? e),
    }));
    const fb = smartFallback(body, heuristicAnalysis(body));
    return json(200, { ...fb, source: "fallback", validated: false });

  }
});


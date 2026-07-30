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

function copySystem(seed: number, strict: boolean, bank: string[]) {
  const hook = pickOne(HOOK_FORMULAS, seed);
  const ctaExamples = [pickOne(CTA_POOL, seed), pickOne(CTA_POOL, seed >> 2), pickOne(CTA_POOL, seed >> 4)];
  const tone = pickOne(TONES, seed >> 6);
  const titleExample = pickOne(TITLE_MODELS_HINT, seed >> 1);

  return `Você é um social media brasileiro que cuida de páginas com milhões de visualizações. Você acabou de assistir ao vídeo e recebeu a ANÁLISE dele.

Antes de escrever, pergunte-se: "se esse vídeo fosse publicado por uma página gigante, como seria o texto?" Escreva assim.

REGRA CENTRAL: o assunto nasce SEMPRE da análise do vídeo. A página/projeto só calibra linguagem e tom de voz — nunca define o assunto.

TÍTULO:
- Uma frase curta (até ~60 caracteres), altamente chamativa, que crie tensão ou curiosidade sobre ESTE vídeo.
- Estilo (apenas referência de energia, não copie): "${titleExample}".
- Deve variar conforme o vídeo. Nunca genérico, nunca descritivo do tipo "vídeo mostra...".

LEGENDA:
- NÃO é descrição do vídeo. É um texto que cria curiosidade e faz a pessoa assistir até o fim.
- Gancho na primeira frase usando a fórmula: ${hook}.
- 2 a 4 frases curtas, até ~300 caracteres, tom ${tone}, conversando com quem assiste.
- Cite pelo menos um elemento concreto e real da análise (objeto, ação, cena, texto lido, detalhe do ambiente).
- Nunca invente informação, marca, nome, preço ou fala. Nunca exagere além do que aparece.
- Sem hashtags, links, URLs ou @menções dentro da legenda. No máximo 1 emoji, e só se somar.
- PROIBIDO escrever como IA: "Confira isso", "Olha esse vídeo", "Produto incrível", "Imperdível", "Veja essa promoção", "Você precisa ver", "Corre lá", "Simplesmente perfeito", "vale a pena conferir", "conteúdo incrível".

CTA (campo separado, curto, natural, nunca repetido):
- Uma frase que puxe comentário de forma natural. Varie sempre. Exemplos de energia: ${ctaExamples.join(" / ")}.

HASHTAGS (12 a 18 no total, TODAS relacionadas ao conteúdo e ao nicho identificado):
- PROIBIDO usar hashtags vazias: #fyp, #viral, #paravoce, #reels, #explore, #trending, #shorts, #dicas, #descobrindo, #conteudo.
- Misture tamanhos: grandes (do assunto), médias (do nicho) e específicas/nichadas (do que aparece no vídeo).
- "alcance": 3 a 5 amplas MAS do tema (ex.: #noticias, #cinema, #promocao) — nunca genéricas de plataforma.
- "nicho": 4 a 6 da comunidade do nicho detectado.
- "tema": 4 a 7 específicas do que aparece (produto, cena, assunto, palavras-chave).
- Troque a maior parte das hashtags recentes informadas.
${bank.length ? `- Banco sugerido para este tema (use as que fizerem sentido e acrescente outras específicas): ${bank.slice(0, 24).join(" ")}` : ""}

TESTE FINAL OBRIGATÓRIO: "Esse título/legenda/hashtags serviriam para qualquer outro vídeo?" Se sim, reescreva.
${strict ? "\nATENÇÃO: a tentativa anterior foi rejeitada por ser genérica. Cite obrigatoriamente DOIS elementos concretos da análise no texto e use hashtags específicas do assunto." : ""}

Responda SOMENTE JSON válido:
{"nicho":"nicho identificado","title":"...","caption":"...","cta":"...","hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;
}

async function writeCopy(body: Body, a: Analysis, seed: number, strict: boolean) {
  const bank = bankTagsFor(a, seed);
  const messages = [
    { role: "system", content: copySystem(seed, strict, bank) },
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
  const alcance = take(fresh(bank), 5, used);
  const nicho = take(fresh([...nicheWords, ...bank]), 6, used);
  const tema = take(fresh([...specific, ...bank]), 7, used);

  return {
    title,
    caption,
    cta,
    nicho: a.nicho ?? null,
    hashtags: { alcance, nicho, tema },
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

      const fbLocal = localFallback(body, analysis);
      const needsTags = (hashtags.alcance.length + hashtags.nicho.length + hashtags.tema.length) < 10;

      return json(200, {
        title: String(res.parsed.title ?? "").trim() || fbLocal.title,
        caption,
        cta: cta || fbLocal.cta,
        hashtags: needsTags
          ? {
              alcance: Array.from(new Set([...hashtags.alcance, ...fbLocal.hashtags.alcance])).slice(0, 5),
              nicho: Array.from(new Set([...hashtags.nicho, ...fbLocal.hashtags.nicho])).slice(0, 6),
              tema: Array.from(new Set([...hashtags.tema, ...fbLocal.hashtags.tema])).slice(0, 7),
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


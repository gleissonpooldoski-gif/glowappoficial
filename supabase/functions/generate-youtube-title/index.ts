// Gera metadados otimizados para YouTube (título, descrição, hashtags e TAGS SEO)
// a partir da legenda do post + contexto do projeto (nome/categoria).
// - hashtags: 8-12 termos curtos (para anexar na descrição).
// - tags: 15-30 palavras-chave SEO variadas (para o campo snippet.tags do YouTube).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { aiErrorResponse } from "../_shared/ai-gateway.ts";
import { callGeminiWithFallback, parseGeminiJson } from "../_shared/gemini.ts";


type ProjectCtx = { name: string | null; category: string | null };

async function resolveProjectFromVideo(videoId?: string | null): Promise<ProjectCtx> {
  if (!videoId) return { name: null, category: null };
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: v } = await supabase
      .from("videos").select("project_id").eq("id", videoId).maybeSingle();
    if (!v?.project_id) return { name: null, category: null };
    const { data: p } = await supabase
      .from("projects").select("name, category").eq("id", v.project_id).maybeSingle();
    return { name: p?.name ?? null, category: (p as any)?.category ?? null };
  } catch { return { name: null, category: null }; }
}

// Retorna instruções específicas de nicho para geração das TAGS.
function categoryTagGuidance(projectName?: string | null, projectCategory?: string | null): string {
  const name = (projectName ?? "").toLowerCase();
  const cat = (projectCategory ?? "").toLowerCase();

  if (name.includes("frame") || cat.includes("cinema") || cat.includes("filme")) {
    return [
      "NICHO: Cinema / Filmes e Séries.",
      "Gere tags relacionadas a: filmes, séries, cinema, streaming, curiosidades,",
      "cenas, personagens, atores, diretores, lançamentos, trailers, entretenimento.",
      "Inclua nomes de personagens/filmes/séries quando forem citados na legenda.",
      "NUNCA misturar memes, humor viral ou produtos.",
    ].join(" ");
  }
  if (name.includes("resenha") || cat.includes("meme") || cat.includes("humor") || cat.includes("comedia")) {
    return [
      "NICHO: Memes / Humor.",
      "Gere tags relacionadas a: memes, humor, vídeos engraçados, internet, viral,",
      "piadas, comédia, tiktoks, reels engraçados, zoeira, entretenimento.",
      "NUNCA usar termos de cinema/filmes/séries neste projeto.",
    ].join(" ");
  }
  if (name.includes("promo") || name.includes("segredo") || cat.includes("produto") || cat.includes("achad")) {
    return [
      "NICHO: Produtos / Achadinhos / Ofertas.",
      "Gere tags relacionadas ao produto apresentado: achadinhos, ofertas, promoção,",
      "desconto, Shopee, Amazon, AliExpress, Mercado Livre, utilidades, gadgets,",
      "casa, cozinha, review. Inclua o nome do produto quando aparecer na legenda.",
    ].join(" ");
  }
  return "Adapte as tags ao tema real do vídeo. Priorize relevância e especificidade.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      caption = "",
      hashtags = "",
      projectName: pnIn = null,
      projectCategory: pcIn = null,
      videoId = null,
    } = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;

    // Enriquece com contexto do projeto se veio videoId.
    let projectName = pnIn as string | null;
    let projectCategory = pcIn as string | null;
    if ((!projectName || !projectCategory) && videoId) {
      const ctx = await resolveProjectFromVideo(String(videoId));
      projectName = projectName ?? ctx.name;
      projectCategory = projectCategory ?? ctx.category;
    }

    const cleanCaption = String(caption)
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    const captionHashtags = (String(caption).match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
    const fieldHashtags = String(hashtags).split(/\s+/).filter((s) => s.startsWith("#"));
    const originalHashtags = Array.from(new Set([...captionHashtags, ...fieldHashtags]));


    console.info(JSON.stringify({
      module: "generate-youtube-title", event: "request_received",
      project: projectName ?? null, project_category: projectCategory ?? null,
      video_id: videoId ?? null, note: "projeto usado apenas como tom de voz",
    }));

    const system =
      "Você é especialista em SEO e algoritmo do YouTube (PT-BR). " +
      "Gere metadados otimizados para um vídeo curto (Shorts/Reels). " +
      "Retorne SOMENTE um JSON válido, sem markdown, sem comentários, no formato: " +
      `{"title": string, "description": string, "hashtags": string[], "tags": string[]}. ` +
      "Regras:\n" +
      "- title: máx. 80 caracteres, desperta CURIOSIDADE mas é honesto, sem hashtags, sem aspas, " +
      "0 ou 1 emoji, com palavras-chave relevantes ao conteúdo real do vídeo.\n" +
      "- description: use a legenda original como base, adapte para YouTube mantendo a mensagem. " +
      "Termine com UMA chamada para ação curta e variada. Máx. 800 caracteres. " +
      "PROIBIDO inserir links, URLs, domínios ou @menções. " +
      "Sem hashtags dentro do texto (elas serão anexadas no final).\n" +
      "- hashtags: array de 8 a 12 hashtags curtas (sem #), minúsculas, sem espaços, sem acentos, " +
      "combinando nicho detectado no conteúdo, tema do vídeo e termos de descoberta. Preserve as originais quando relevantes.\n" +
      "- tags: array de 15 a 30 palavras-chave SEO ESPECÍFICAS ao vídeo (campo snippet.tags do YouTube). " +
      "Podem conter espaços, acentos e maiúsculas. Misture: palavra-chave principal, secundárias, " +
      "long-tail (frases de busca), sinônimos, termos relacionados, personagens/produtos citados. " +
      "Cada tag entre 2 e 60 caracteres. NUNCA repetir palavras. " +
      "NUNCA usar tags genéricas sem relação (ex: 'viral', 'foryou' sozinhos). Priorize RELEVÂNCIA.\n" +
      "- O nicho deve ser deduzido do CONTEÚDO do vídeo (legenda/áudio/textos), nunca do nome do canal ou da categoria cadastrada.\n" +
      "- O nome do canal serve apenas como TOM DE VOZ e identidade da marca.";

    const user =
      `Legenda original:\n"""${cleanCaption || "(sem legenda)"}"""` +
      (originalHashtags.length ? `\nHashtags originais: ${originalHashtags.join(" ")}` : "") +
      (projectName ? `\nIdentidade do canal (só tom de voz): ${projectName}` : "") +
      "\n\nGere o JSON com title, description, hashtags e tags a partir do CONTEÚDO do vídeo.";


    const { text: raw } = await callGeminiWithFallback({
      module: "generate-youtube-title",
      stage: "copy",
      system,
      parts: [{ text: user }],
      json: true,
      context: { project: projectName, videoId },
    });


    const parsed = parseGeminiJson<{ title?: string; description?: string; hashtags?: string[]; tags?: string[] }>(raw);

    let title = String(parsed.title ?? "").trim();
    title = title
      .replace(/^["“”'`]+|["“”'`]+$/g, "")
      .replace(/^t[íi]tulo\s*:\s*/i, "")
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    if (!title) title = cleanCaption.split(/[.!?\n]/)[0]?.trim().slice(0, 80) || projectName || "Novo vídeo";

    let description = String(parsed.description ?? "").trim();
    if (!description) {
      description = cleanCaption;
      if (description && !/inscreva|curta|compartilhe|like|deixe/i.test(description)) {
        description += "\n\n👉 Inscreva-se no canal para mais vídeos!";
      }
    }
    description = description.slice(0, 4500);

    // Hashtags (curto, para descrição)
    let hashtagsOut = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    hashtagsOut = hashtagsOut
      .map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
      .filter((h) => h && /^[\p{L}\p{N}_]+$/u.test(h));
    const originalNoHash = originalHashtags.map((h) => h.replace(/^#/, "").toLowerCase());
    for (const h of originalNoHash) if (!hashtagsOut.includes(h)) hashtagsOut.unshift(h);
    hashtagsOut = Array.from(new Set(hashtagsOut)).slice(0, 15);

    if (hashtagsOut.length) {
      const tagLine = hashtagsOut.map((h) => `#${h}`).join(" ");
      description = `${description}\n\n${tagLine}`.slice(0, 5000);
    }

    // TAGS SEO (campo snippet.tags do YouTube — limite total 500 chars).
    let tagsOut = Array.isArray(parsed.tags) ? parsed.tags : [];
    const seen = new Set<string>();
    tagsOut = tagsOut
      .map((t) => String(t).replace(/^#/, "").replace(/\s+/g, " ").trim())
      .filter((t) => {
        if (!t) return false;
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        if (t.length < 2 || t.length > 60) return false;
        seen.add(k);
        return true;
      });
    // Fallback: se veio pouco, combina com hashtags convertidas.
    if (tagsOut.length < 8) {
      for (const h of hashtagsOut) {
        const k = h.toLowerCase();
        if (!seen.has(k)) { seen.add(k); tagsOut.push(h); }
      }
    }
    // Aplica limite de 500 caracteres total (regra do YouTube).
    const limited: string[] = [];
    let totalLen = 0;
    for (const t of tagsOut) {
      const add = (limited.length ? 1 : 0) + t.length + (t.includes(" ") ? 2 : 0);
      if (totalLen + add > 480) break;
      limited.push(t);
      totalLen += add;
      if (limited.length >= 30) break;
    }
    tagsOut = limited;

    return new Response(
      JSON.stringify({ title, description, hashtags: hashtagsOut, tags: tagsOut }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return aiErrorResponse("generate-youtube-title", e, corsHeaders);
  }
});

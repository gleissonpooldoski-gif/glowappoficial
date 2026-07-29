// Gera legenda + hashtags otimizadas para TikTok a partir da legenda base.
// Foco: gancho inicial forte, texto curto, hashtags de descoberta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { aiErrorResponse, callAi, parseModelJson } from "../_shared/ai-gateway.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      caption = "",
      hashtags = "",
      projectName = null,
      projectCategory = null,
    } = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;

    const cleanCaption = String(caption)
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    const captionHashtags = (String(caption).match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
    const fieldHashtags = String(hashtags).split(/\s+/).filter((s) => s.startsWith("#"));
    const originalHashtags = Array.from(new Set([...captionHashtags, ...fieldHashtags]));


    const isSegredo = (() => {
      const s = `${projectName ?? ""} ${projectCategory ?? ""}`.toLowerCase();
      return s.includes("segredo") || s.includes("promo") || s.includes("achad");
    })();

    const system =
      "Você é especialista no algoritmo do TikTok (PT-BR). " +
      "Adapte o conteúdo para MAXIMIZAR descoberta, visualizações e comentários no TikTok. " +
      "Retorne SOMENTE JSON válido: {\"caption\": string, \"hashtags\": string[]}. " +
      "Regras da caption:\n" +
      "- Máx. 150 caracteres.\n" +
      "- Primeira frase é um GANCHO forte (pergunta, afirmação polêmica, curiosidade).\n" +
      "- Linguagem informal, direta, conversacional.\n" +
      "- 0 a 2 emojis (só se agregarem).\n" +
      "- Sem hashtags no corpo da caption (irão em hashtags separadamente).\n" +
      "- Pode terminar com CTA curto (ex: 'comenta aí', 'salva pra depois').\n" +
      "Regras das hashtags:\n" +
      "- 5 a 8 hashtags, sem #, minúsculas, sem acentos.\n" +
      "- Combine: nicho, tema do vídeo, tendências relacionadas ao assunto, termos de descoberta (fyp, foryou quando fizer sentido).\n" +
      "- Preserve hashtags originais quando relevantes." +
      (isSegredo
        ? "\n\nMODO ESPECIAL — SEGREDO DAS PROMOÇÕES (CONVERSÃO):\n" +
          "- Nunca faça texto meramente descritivo do produto — desperte CURIOSIDADE.\n" +
          "- PROIBIDO incluir links, URLs, domínios ou @menções.\n" +
          "- A caption DEVE terminar com CTA direcionando para a BIO ou pedindo o link nos comentários. Alterne naturalmente entre: 'link na bio', 'produto na bio', 'peça o link nos comentários', 'confira na bio', 'responda LINK', 'detalhes na bio', 'veja o preço na bio'.\n" +
          "- Nunca repita o mesmo CTA duas vezes seguidas.\n" +
          "- Ganchos como: 'o produto que todo mundo está procurando', 'esse achado está viralizando', 'você não vai acreditar no que ele faz'."
        : "");

    const user =
      `Conteúdo base:\n"""${cleanCaption || "(sem descrição)"}"""` +
      (originalHashtags.length ? `\nHashtags originais: ${originalHashtags.join(" ")}` : "") +
      (projectName ? `\nProjeto: ${projectName}` : "") +
      (projectCategory ? `\nNicho: ${projectCategory}` : "") +
      "\n\nGere caption + hashtags adaptadas para TikTok.";

    const raw = await callAi({
      module: "generate-tiktok-caption",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      context: { project: projectName },
    });

    const parsed = parseModelJson<{ caption?: string; hashtags?: string[] }>(raw);

    let outCaption = String(parsed.caption ?? "").trim();
    outCaption = outCaption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
    if (!outCaption) outCaption = cleanCaption.split(/[.!?\n]/)[0]?.trim().slice(0, 140) || projectName || "";

    let tags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    tags = tags.map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
      .filter((h) => h && /^[\p{L}\p{N}_]+$/u.test(h));
    const originalNoHash = originalHashtags.map((h) => h.replace(/^#/, "").toLowerCase());
    for (const h of originalNoHash) if (!tags.includes(h)) tags.unshift(h);
    tags = Array.from(new Set(tags)).slice(0, 10);

    const tagLine = tags.map((t) => `#${t}`).join(" ");
    const finalCaption = [outCaption, tagLine].filter(Boolean).join("\n\n").slice(0, 2200);

    return new Response(
      JSON.stringify({ caption: finalCaption, hashtags: tags, hook: outCaption }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return aiErrorResponse("generate-tiktok-caption", e, corsHeaders);
  }
});

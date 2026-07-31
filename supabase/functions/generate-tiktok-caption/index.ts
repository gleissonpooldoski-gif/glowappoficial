// Gera legenda + hashtags otimizadas para TikTok a partir da legenda base.
// Foco: gancho inicial forte, texto curto, hashtags de descoberta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { aiErrorResponse } from "../_shared/ai-gateway.ts";
import { callGeminiWithFallback, parseGeminiJson } from "../_shared/gemini.ts";

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


    console.info(JSON.stringify({
      module: "generate-tiktok-caption", event: "request_received",
      project: projectName ?? null, project_category: projectCategory ?? null,
      note: "projeto usado apenas como tom de voz",
    }));

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
      "- Termine com CTA curto e variado (ex: 'comenta aí', 'salva pra depois', 'link na bio' quando fizer sentido).\n" +
      "- PROIBIDO incluir links, URLs, domínios ou @menções.\n" +
      "Regras das hashtags:\n" +
      "- 5 a 8 hashtags, sem #, minúsculas, sem acentos.\n" +
      "- Combine: nicho detectado no conteúdo, tema do vídeo, tendências relacionadas ao assunto, termos de descoberta (fyp, foryou quando fizer sentido).\n" +
      "- Preserve hashtags originais quando relevantes.\n" +
      "O nome da página serve apenas como TOM DE VOZ — nunca como assunto do vídeo.";

    const user =
      `Conteúdo base:\n"""${cleanCaption || "(sem descrição)"}"""` +
      (originalHashtags.length ? `\nHashtags originais: ${originalHashtags.join(" ")}` : "") +
      (projectName ? `\nIdentidade da página (só tom de voz): ${projectName}` : "") +
      "\n\nGere caption + hashtags adaptadas para TikTok a partir do CONTEÚDO do vídeo.";


    const { text: raw } = await callGeminiWithFallback({
      module: "generate-tiktok-caption",
      stage: "copy",
      system,
      parts: [{ text: user }],
      json: true,
      context: { project: projectName },
    });

    const parsed = parseGeminiJson<{ caption?: string; hashtags?: string[] }>(raw);

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

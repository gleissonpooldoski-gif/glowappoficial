// Gera legenda + hashtags otimizadas para TikTok a partir da legenda base.
// Foco: gancho inicial forte, texto curto, hashtags de descoberta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      caption = "",
      hashtags = "",
      projectName = null,
      projectCategory = null,
    } = await req.json();

    const cleanCaption = String(caption)
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    const captionHashtags = (String(caption).match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
    const fieldHashtags = String(hashtags).split(/\s+/).filter((s) => s.startsWith("#"));
    const originalHashtags = Array.from(new Set([...captionHashtags, ...fieldHashtags]));

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");

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
      "- Preserve hashtags originais quando relevantes.";

    const user =
      `Conteúdo base:\n"""${cleanCaption || "(sem descrição)"}"""` +
      (originalHashtags.length ? `\nHashtags originais: ${originalHashtags.join(" ")}` : "") +
      (projectName ? `\nProjeto: ${projectName}` : "") +
      (projectCategory ? `\nNicho: ${projectCategory}` : "") +
      "\n\nGere caption + hashtags adaptadas para TikTok.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI Gateway ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const raw = String(json?.choices?.[0]?.message?.content ?? "").trim();

    let parsed: { caption?: string; hashtags?: string[] } = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch { parsed = {}; }

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
  } catch (e: any) {
    console.error("[generate-tiktok-caption]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

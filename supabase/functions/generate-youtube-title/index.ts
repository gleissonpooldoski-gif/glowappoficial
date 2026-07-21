// Gera título otimizado para YouTube a partir da legenda do post.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { caption = "", projectName = null, projectCategory = null } = await req.json();
    const cleanCaption = String(caption)
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");

    const system =
      "Você cria títulos curtos e otimizados para YouTube (PT-BR). " +
      "Regras: máx. 80 caracteres, sem hashtags, sem emojis excessivos (0 ou 1), " +
      "sem aspas, sem prefixos tipo 'Título:', chamativo mas honesto, " +
      "pense em CTR e SEO. Retorne SOMENTE o título, sem explicações.";
    const user =
      `Legenda do post:\n"""${cleanCaption || "(sem legenda)"}"""` +
      (projectName ? `\nProjeto: ${projectName}` : "") +
      (projectCategory ? `\nCategoria: ${projectCategory}` : "") +
      "\n\nGere o melhor título para YouTube:";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI Gateway ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json: any = await res.json();
    let title = String(json?.choices?.[0]?.message?.content ?? "").trim();
    title = title
      .replace(/^["“”'`]+|["“”'`]+$/g, "")
      .replace(/^t[íi]tulo\s*:\s*/i, "")
      .replace(/#[\p{L}\p{N}_]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);

    if (!title) title = cleanCaption.slice(0, 80) || projectName || "Novo vídeo";

    return new Response(JSON.stringify({ title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    console.error("[generate-youtube-title]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

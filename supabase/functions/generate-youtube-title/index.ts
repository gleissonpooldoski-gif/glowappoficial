// Gera metadados otimizados para YouTube (título, descrição e hashtags) a partir da legenda do post.
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
      "Você é especialista em SEO e algoritmo do YouTube (PT-BR). " +
      "Gere metadados otimizados para um vídeo curto (Shorts/Reels). " +
      "Retorne SOMENTE um JSON válido, sem markdown, sem comentários, no formato: " +
      `{"title": string, "description": string, "hashtags": string[]}. ` +
      "Regras:\n" +
      "- title: máx. 80 caracteres, chamativo mas honesto, sem clickbait exagerado, " +
      "sem hashtags, sem aspas, sem emojis excessivos (0 ou 1), com palavras-chave relevantes ao tema.\n" +
      "- description: use a legenda original como base, adapte levemente para o formato YouTube, " +
      "mantendo a mensagem. Adicione UMA chamada para ação curta no final (ex: 'Inscreva-se para mais!', " +
      "'Deixe seu like e compartilhe.') quando fizer sentido. Máx. 800 caracteres. Sem hashtags dentro do texto.\n" +
      "- hashtags: array de 8 a 12 hashtags relevantes (sem o #), combinando nicho, tema do vídeo e " +
      "termos populares de descoberta. Todas em minúsculas, sem espaços, sem acentos. " +
      "Preserve as hashtags originais quando forem relevantes.";

    const user =
      `Legenda original:\n"""${cleanCaption || "(sem legenda)"}"""` +
      (originalHashtags.length ? `\nHashtags originais: ${originalHashtags.join(" ")}` : "") +
      (projectName ? `\nProjeto/Canal: ${projectName}` : "") +
      (projectCategory ? `\nCategoria: ${projectCategory}` : "") +
      "\n\nGere o JSON com title, description e hashtags.";

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

    let parsed: { title?: string; description?: string; hashtags?: string[] } = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }

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

    let hashtagsOut = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    hashtagsOut = hashtagsOut
      .map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
      .filter((h) => h && /^[\p{L}\p{N}_]+$/u.test(h));
    // Garante ao menos as hashtags originais
    const originalNoHash = originalHashtags.map((h) => h.replace(/^#/, "").toLowerCase());
    for (const h of originalNoHash) if (!hashtagsOut.includes(h)) hashtagsOut.unshift(h);
    hashtagsOut = Array.from(new Set(hashtagsOut)).slice(0, 15);

    // Anexa hashtags ao final da descrição (padrão YouTube)
    if (hashtagsOut.length) {
      const tagLine = hashtagsOut.map((h) => `#${h}`).join(" ");
      const combined = `${description}\n\n${tagLine}`;
      description = combined.slice(0, 5000);
    }

    return new Response(
      JSON.stringify({ title, description, hashtags: hashtagsOut }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("[generate-youtube-title]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

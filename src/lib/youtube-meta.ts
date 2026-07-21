// Constrói título/descrição/tags para YouTube a partir da legenda do post.
// Regra: título NUNCA usa nome do arquivo. Sempre gerado pela IA (com fallback local).
// Descrição inclui a legenda original + CTA + hashtags no final (padrão YouTube).
// Hashtags são geradas pela IA combinando nicho, tema e termos de descoberta.
import { supabase } from "@/integrations/supabase/client";

export type YoutubeMeta = { title: string; description: string; tags: string[] };

export async function buildYoutubeMetaFromCaption(
  caption: string,
  hashtagsField = "",
  ctx: { projectName?: string | null; projectCategory?: string | null } = {},
): Promise<YoutubeMeta> {
  const captionRaw = caption ?? "";
  const hashtagsFromCaption = (captionRaw.match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
  const hashtagsFromField = (hashtagsField ?? "").split(/\s+/).filter((s) => s.startsWith("#"));
  const originalHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
  const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

  let title = "";
  let description = "";
  let tags: string[] = [];

  try {
    const { data, error } = await supabase.functions.invoke("generate-youtube-title", {
      body: {
        caption: captionRaw,
        hashtags: hashtagsField,
        projectName: ctx.projectName ?? null,
        projectCategory: ctx.projectCategory ?? null,
      },
    });
    if (!error && data) {
      title = String((data as any)?.title ?? "").trim();
      description = String((data as any)?.description ?? "").trim();
      const hs = (data as any)?.hashtags;
      if (Array.isArray(hs)) tags = hs.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean);
    }
  } catch { /* fallback abaixo */ }

  // Fallbacks locais caso a IA falhe
  if (!title) {
    title = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || ctx.projectName || "Novo vídeo").trim();
  }
  title = title.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);

  if (!tags.length) {
    tags = originalHashtags.map((t) => t.replace(/^#/, "")).filter(Boolean);
  }
  tags = Array.from(new Set(tags)).slice(0, 15);

  if (!description) {
    const cta = "\n\n👉 Inscreva-se no canal para mais vídeos!";
    const tagLine = tags.length ? `\n\n${tags.map((t) => `#${t}`).join(" ")}` : "";
    description = `${captionNoTags}${cta}${tagLine}`.slice(0, 5000);
  }

  return { title, description, tags };
}

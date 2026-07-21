// Constrói título/descrição/tags para YouTube a partir da legenda do post.
// Regra: título NUNCA usa nome do arquivo. Sempre gerado da legenda (IA + fallback).
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
  const allHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
  const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

  let title = "";
  try {
    const { data: t, error } = await supabase.functions.invoke("generate-youtube-title", {
      body: {
        caption: captionNoTags,
        projectName: ctx.projectName ?? null,
        projectCategory: ctx.projectCategory ?? null,
      },
    });
    if (!error) title = String((t as any)?.title ?? "").trim();
  } catch { /* fallback abaixo */ }
  if (!title) {
    title = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || ctx.projectName || "Novo vídeo").trim();
  }
  title = title.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);

  const description = [captionNoTags, allHashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 5000);
  const tags = allHashtags.map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 15);

  return { title, description, tags };
}

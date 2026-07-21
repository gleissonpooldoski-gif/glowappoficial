// Constrói caption adaptada para TikTok a partir da legenda base do post.
// Foco: gancho inicial forte + hashtags de descoberta. Nunca reaproveita
// literalmente a legenda do Instagram — adapta pela IA (com fallback local).
import { supabase } from "@/integrations/supabase/client";

export type TiktokMeta = { caption: string; hashtags: string[]; hook: string };

export async function buildTiktokCaptionFromBase(
  baseCaption: string,
  hashtagsField = "",
  ctx: { projectName?: string | null; projectCategory?: string | null } = {},
): Promise<TiktokMeta> {
  const captionRaw = baseCaption ?? "";
  const hashtagsFromCaption = (captionRaw.match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
  const hashtagsFromField = (hashtagsField ?? "").split(/\s+/).filter((s) => s.startsWith("#"));
  const originalHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
  const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

  try {
    const { data, error } = await supabase.functions.invoke("generate-tiktok-caption", {
      body: {
        caption: captionRaw,
        hashtags: hashtagsField,
        projectName: ctx.projectName ?? null,
        projectCategory: ctx.projectCategory ?? null,
      },
    });
    if (!error && data) {
      const caption = String((data as any)?.caption ?? "").trim();
      const hs = (data as any)?.hashtags;
      const hook = String((data as any)?.hook ?? "").trim();
      if (caption) {
        const hashtags = Array.isArray(hs)
          ? hs.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean)
          : [];
        return { caption, hashtags, hook: hook || caption.split("\n")[0] };
      }
    }
  } catch { /* fallback abaixo */ }

  // Fallback local: usa a 1ª frase como gancho + hashtags originais.
  const hook = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || ctx.projectName || "").trim().slice(0, 140);
  const tags = originalHashtags.map((h) => h.replace(/^#/, "").toLowerCase()).slice(0, 8);
  const tagLine = tags.map((t) => `#${t}`).join(" ");
  const caption = [hook, tagLine].filter(Boolean).join("\n\n").slice(0, 2200);
  return { caption, hashtags: tags, hook };
}

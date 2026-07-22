// Constrói título/descrição/hashtags/tags para YouTube a partir da legenda do post.
// - title/description/hashtags: como antes (descrição já vem com hashtags anexadas).
// - tags: 15-30 palavras-chave SEO específicas ao vídeo (campo snippet.tags do YouTube).
//   Geradas pela IA com base em nicho/categoria do projeto (Cinema, Memes, Produtos, etc).
import { supabase } from "@/integrations/supabase/client";

export type YoutubeMeta = {
  title: string;
  description: string;
  tags: string[];       // SEO tags → snippet.tags
  hashtags: string[];   // hashtags curtas (para descrição)
};

export async function buildYoutubeMetaFromCaption(
  caption: string,
  hashtagsField = "",
  ctx: { projectName?: string | null; projectCategory?: string | null; videoId?: string | null } = {},
): Promise<YoutubeMeta> {
  const captionRaw = caption ?? "";
  const hashtagsFromCaption = (captionRaw.match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
  const hashtagsFromField = (hashtagsField ?? "").split(/\s+/).filter((s) => s.startsWith("#"));
  const originalHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
  const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

  let title = "";
  let description = "";
  let tags: string[] = [];
  let hashtags: string[] = [];

  try {
    const { data, error } = await supabase.functions.invoke("generate-youtube-title", {
      body: {
        caption: captionRaw,
        hashtags: hashtagsField,
        projectName: ctx.projectName ?? null,
        projectCategory: ctx.projectCategory ?? null,
        videoId: ctx.videoId ?? null,
      },
    });
    if (!error && data) {
      title = String((data as any)?.title ?? "").trim();
      description = String((data as any)?.description ?? "").trim();
      const hs = (data as any)?.hashtags;
      if (Array.isArray(hs)) hashtags = hs.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean);
      const ts = (data as any)?.tags;
      if (Array.isArray(ts)) tags = ts.map((t: any) => String(t).trim()).filter(Boolean);
    }
  } catch { /* fallback abaixo */ }

  if (!title) {
    title = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || ctx.projectName || "Novo vídeo").trim();
  }
  title = title.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);

  if (!hashtags.length) {
    hashtags = originalHashtags.map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean);
  }
  hashtags = Array.from(new Set(hashtags)).slice(0, 15);

  if (!tags.length) {
    // Fallback local: usa hashtags como base de tags.
    tags = hashtags.slice();
  }
  // Sanitização final e limite 500 chars.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  let totalLen = 0;
  for (const raw of tags) {
    const t = String(raw).replace(/^#/, "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    if (t.length < 2 || t.length > 60) continue;
    seen.add(k);
    const add = (cleaned.length ? 1 : 0) + t.length + (t.includes(" ") ? 2 : 0);
    if (totalLen + add > 480) break;
    cleaned.push(t);
    totalLen += add;
    if (cleaned.length >= 30) break;
  }
  tags = cleaned;

  if (!description) {
    const cta = "\n\n👉 Inscreva-se no canal para mais vídeos!";
    const tagLine = hashtags.length ? `\n\n${hashtags.map((t) => `#${t}`).join(" ")}` : "";
    description = `${captionNoTags}${cta}${tagLine}`.slice(0, 5000);
  }

  return { title, description, tags, hashtags };
}

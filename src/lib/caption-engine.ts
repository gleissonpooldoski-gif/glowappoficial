// MOTOR CENTRAL de geração automática de legenda + CTA + hashtags.
// Todos os fluxos (publicação manual, agendamento, lote, adicionar redes,
// duplicação) DEVEM usar `generateVideoContent` / `ensurePostContent`.
// Nunca lança erro: se a IA falhar, devolve conteúdo de fallback.
import { supabase } from "@/integrations/supabase/client";
import { extractVideoFrames } from "@/lib/videoFrames";

export type HashtagGroups = { alcance: string[]; nicho: string[]; tema: string[] };

export type GeneratedContent = {
  title: string;          // título curto e chamativo
  caption: string;        // legenda (sem hashtags)
  cta: string;            // chamada para ação
  hashtags: string[];     // lista plana, já com "#"
  hashtagsText: string;   // hashtags separadas por espaço
  groups: HashtagGroups;
  captionFull: string;    // título + legenda + CTA + hashtags (pronto para publicar)
  source: "ai" | "fallback";
  analysis?: string;
};

export type GenerateInput = {
  videoId?: string | null;
  videoUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
  videoText?: string | null;
  style?: string | null;
  frameCount?: number;
};

export const flattenGroups = (g: any): string[] => {
  if (!g) return [];
  if (Array.isArray(g)) return g.map((t: any) => String(t)).filter(Boolean);
  return [
    ...(Array.isArray(g.alcance) ? g.alcance : []),
    ...(Array.isArray(g.nicho) ? g.nicho : []),
    ...(Array.isArray(g.tema) ? g.tema : []),
  ].map((t: any) => String(t)).filter(Boolean);
};

const withHash = (t: string) => (t.startsWith("#") ? t : `#${t}`);

/** Resolve uma URL reproduzível do vídeo processado, se ainda não tivermos. */
async function resolveVideoUrl(input: GenerateInput): Promise<string | null> {
  if (input.videoUrl) return input.videoUrl;
  if (!input.videoId) return null;
  try {
    const { data: row } = await supabase
      .from("videos")
      .select("processed_path")
      .eq("id", input.videoId)
      .maybeSingle();
    const path = (row as any)?.processed_path as string | null;
    if (!path) return null;
    const { data: s } = await supabase.storage
      .from("videos-processed")
      .createSignedUrl(path, 60 * 30);
    return s?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Últimas legendas/hashtags usadas — evita repetição de estrutura e de tags. */
async function loadHistory(): Promise<{ captions: string[]; hashtags: string[] }> {
  let rows: any[] = [];
  try {
    const { data } = await supabase
      .from("instagram_posts")
      .select("caption, hashtags")
      .order("created_at", { ascending: false })
      .limit(12);
    rows = data ?? [];
  } catch {
    rows = [];
  }


  const captions = rows
    .map((r: any) => String(r?.caption ?? "").split("\n")[0].trim())
    .filter((c: string) => c.length > 10)
    .slice(0, 8);

  const hashtags = Array.from(
    new Set(
      rows
        .flatMap((r: any) => String(r?.hashtags ?? "").split(/\s+/))
        .map((t: string) => t.trim())
        .filter((t: string) => t.startsWith("#") && t.length > 2),
    ),
  ).slice(0, 40);

  return { captions, hashtags };
}


/** Fallback local no cliente — só usado se a Edge Function estiver totalmente fora.
 *  Não usa projeto/categoria como assunto: o projeto é apenas identidade. */
function clientFallback(input: GenerateInput, reason: string): GeneratedContent {
  console.warn("[caption-engine] fallback local", { videoId: input.videoId ?? null, reason });
  const title = "Repara no detalhe que aparece no fim";
  const cta = "Conta aqui nos comentários o que você achou.";
  const caption = (input.videoText?.trim() ||
    "Tem um detalhe nesse vídeo que só faz sentido quando você assiste até o fim").replace(/\s+/g, " ");
  const groups: HashtagGroups = { alcance: [], nicho: [], tema: [] };
  const hashtags = flattenGroups(groups);
  return {
    title,
    caption,
    cta,
    hashtags,
    hashtagsText: hashtags.join(" "),
    groups,
    captionFull: [title, caption, cta].filter(Boolean).join("\n\n"),
    source: "fallback",
  };
}



/**
 * Geração automática única para TODOS os fluxos e TODOS os projetos.
 * O projeto entra apenas como identidade (tom de voz / marca) e NUNCA
 * condiciona se a geração acontece. Nunca lança.
 */
export async function generateVideoContent(input: GenerateInput): Promise<GeneratedContent> {
  console.info("[caption-engine] início", {
    videoId: input.videoId ?? null,
    projectId: input.projectId ?? null,
    project: input.projectName ?? null,
    filename: input.filename ?? null,
  });

  let frames: string[] = [];
  let videoUrl: string | null = null;
  try {
    videoUrl = await resolveVideoUrl(input);
    if (videoUrl) frames = await extractVideoFrames(videoUrl, input.frameCount ?? 16).catch(() => []);
  } catch { /* segue sem frames */ }
  console.info("[caption-engine] análise preparada", {
    videoId: input.videoId ?? null, temVideoUrl: Boolean(videoUrl), frames: frames.length,
  });

  const history = await loadHistory();

  try {
    const { data, error } = await supabase.functions.invoke("generate-caption", {
      body: {
        videoId: input.videoId ?? null,
        videoUrl,
        filename: input.filename ?? undefined,
        templateName: input.templateName ?? null,
        // Identidade da página (tom de voz) — nunca o assunto do vídeo.
        projectName: input.projectName ?? null,
        projectCategory: input.projectCategory ?? null,
        videoText: input.videoText ?? null,
        style: input.style ?? null,
        frames,
        history: history.captions,
        recentHashtags: history.hashtags,
        variationSeed: Math.floor(Math.random() * 1e6),
      },
    });
    if (error) throw error;


    const title = String((data as any)?.title ?? "").trim();
    const caption = String((data as any)?.caption ?? "").trim();
    const cta = String((data as any)?.cta ?? "").trim();
    const groupsRaw = (data as any)?.hashtags;
    const groups: HashtagGroups = Array.isArray(groupsRaw)
      ? { alcance: groupsRaw.map(String), nicho: [], tema: [] }
      : {
          alcance: (groupsRaw?.alcance ?? []).map(String),
          nicho: (groupsRaw?.nicho ?? []).map(String),
          tema: (groupsRaw?.tema ?? []).map(String),
        };
    const hashtags = Array.from(new Set(flattenGroups(groups).map(withHash)));

    if (!caption) return clientFallback(input, "edge_function_sem_legenda");

    // Estrutura final: gancho + contexto (caption) → CTA → hashtags.
    // O título é interno; não é prefixado na legenda publicada.
    const withCta = cta && !caption.toLowerCase().includes(cta.toLowerCase().slice(0, 18))
      ? `${caption}\n\n${cta}`
      : caption;

    console.info("[caption-engine] concluído", {
      videoId: input.videoId ?? null,
      source: (data as any)?.source ?? "ai",
      niche: (data as any)?.niche ?? null,
      chars: caption.length,
      hashtags: hashtags.length,
    });

    return {
      title,
      caption,
      cta,
      hashtags,
      hashtagsText: hashtags.join(" "),
      groups,
      captionFull: [withCta, hashtags.join(" ")].filter(Boolean).join("\n\n"),

      source: ((data as any)?.source === "fallback" ? "fallback" : "ai"),
      analysis: String((data as any)?.analysis ?? "") || undefined,
    };
  } catch (e: any) {
    return clientFallback(input, `edge_function_indisponivel: ${e?.message ?? "erro"}`);
  }
}


/**
 * Garante que uma publicação tenha legenda e hashtags.
 * Se já houver conteúdo, devolve o existente; caso contrário gera e persiste.
 * Usado por "Adicionar redes", duplicação e edição de publicações.
 */
export async function ensurePostContent(post: {
  id?: string | null;
  video_id?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
  filename?: string | null;
}): Promise<{ caption: string; hashtags: string }> {
  const caption = String(post.caption ?? "").trim();
  const hashtags = String(post.hashtags ?? "").trim();
  if (caption) return { caption, hashtags };

  const gen = await generateVideoContent({
    videoId: post.video_id ?? null,
    filename: post.filename ?? null,
    projectName: post.projectName ?? null,
    projectCategory: post.projectCategory ?? null,
  });

  const nextCaption = gen.cta && !gen.caption.includes(gen.cta)
    ? `${gen.caption}\n\n${gen.cta}`
    : gen.caption;
  const nextHashtags = hashtags || gen.hashtagsText;

  if (post.id) {
    try {
      await supabase
        .from("instagram_posts")
        .update({ caption: nextCaption, hashtags: nextHashtags })
        .eq("id", post.id);
    } catch { /* persistência é best-effort */ }
  }

  return { caption: nextCaption, hashtags: nextHashtags };
}

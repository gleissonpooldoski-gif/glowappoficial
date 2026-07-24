// Valida se um projeto pode agendar em uma lista de plataformas.
// Também confirma que o arquivo de vídeo existe no Storage antes de agendar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VIDEO_BUCKET = "videos-processed";

type Platform = "instagram" | "facebook" | "youtube" | "tiktok";

interface Blocker {
  platform: Platform;
  reason: string;
  action: "reconnect" | "link_account" | "check_video" | "none";
}

async function checkInstagram(projectId: string | null, projectName: string | null): Promise<Blocker | null> {
  if (!projectName) return { platform: "instagram", reason: "Projeto sem nome/vínculo", action: "link_account" };
  const { data } = await supabase.from("instagram_credentials")
    .select("account, access_token").eq("account", projectName).maybeSingle();
  if (!data?.access_token) return { platform: "instagram", reason: "Conta Instagram não conectada", action: "link_account" };
  const { data: health } = await supabase.from("connection_health")
    .select("status").eq("platform", "instagram").eq("account_ref", projectName).maybeSingle();
  if (health?.status === "expired") return { platform: "instagram", reason: "Token Instagram expirado", action: "reconnect" };
  return null;
}

async function checkFacebook(projectId: string | null): Promise<Blocker | null> {
  if (!projectId) return { platform: "facebook", reason: "Projeto não identificado", action: "link_account" };
  const { data } = await supabase.from("facebook_accounts")
    .select("page_id, connection_status, page_access_token").eq("project_id", projectId).maybeSingle();
  if (!data?.page_id) return { platform: "facebook", reason: "Página do Facebook não vinculada", action: "link_account" };
  if (!data.page_access_token) return { platform: "facebook", reason: "Facebook sem token", action: "reconnect" };
  if (data.connection_status === "expired") return { platform: "facebook", reason: "Token do Facebook expirado. Reconecte a Página.", action: "reconnect" };
  return null;
}

async function checkYouTube(projectName: string | null): Promise<Blocker | null> {
  if (!projectName) return { platform: "youtube", reason: "Projeto não identificado", action: "link_account" };
  const { data } = await supabase.from("youtube_credentials")
    .select("account, refresh_token").eq("account", projectName).maybeSingle();
  if (!data?.refresh_token) return { platform: "youtube", reason: "Canal YouTube não conectado", action: "link_account" };
  const { data: health } = await supabase.from("connection_health")
    .select("status").eq("platform", "youtube").eq("account_ref", projectName).maybeSingle();
  if (health?.status === "expired") return { platform: "youtube", reason: "Token YouTube expirado", action: "reconnect" };
  return null;
}

async function checkTikTok(projectName: string | null): Promise<Blocker | null> {
  if (!projectName) return { platform: "tiktok", reason: "Projeto não identificado", action: "link_account" };
  const { data } = await supabase.from("tiktok_credentials")
    .select("account, access_token").eq("account", projectName).maybeSingle();
  if (!data?.access_token) return { platform: "tiktok", reason: "Conta TikTok não conectada", action: "link_account" };
  const { data: health } = await supabase.from("connection_health")
    .select("status").eq("platform", "tiktok").eq("account_ref", projectName).maybeSingle();
  if (health?.status === "expired") return { platform: "tiktok", reason: "Token TikTok expirado", action: "reconnect" };
  return null;
}

// Guard: confere arquivo no Storage antes de agendar. Se ausente/ilegível, bloqueia.
export async function checkVideoAsset(videoId: string | null): Promise<Blocker | null> {
  if (!videoId) return null;
  const { data: v } = await supabase
    .from("videos")
    .select("id, processed_path, processed_url, original_path, original_url, mime_type, size_bytes")
    .eq("id", videoId).maybeSingle();
  if (!v) return { platform: "instagram", reason: "Vídeo não encontrado no banco", action: "check_video" };

  const path = v.processed_path ?? v.original_path ?? null;
  const url = v.processed_url ?? v.original_url ?? null;
  if (!path && !url) return { platform: "instagram", reason: "Vídeo sem arquivo processado", action: "check_video" };

  // Se temos path do storage, verifica existência real
  if (path) {
    try {
      const folder = path.split("/").slice(0, -1).join("/");
      const filename = path.split("/").pop()!;
      const { data: list, error } = await supabase.storage.from(VIDEO_BUCKET).list(folder, { search: filename, limit: 1 });
      if (error) return { platform: "instagram", reason: `Storage inacessível: ${error.message}`, action: "check_video" };
      const found = (list ?? []).find((f) => f.name === filename);
      if (!found) return { platform: "instagram", reason: "Arquivo de vídeo não encontrado no Storage", action: "check_video" };
      const size = (found.metadata as any)?.size ?? 0;
      if (size === 0) return { platform: "instagram", reason: "Arquivo de vídeo vazio no Storage", action: "check_video" };
    } catch (e) {
      return { platform: "instagram", reason: `Falha ao validar arquivo: ${String(e)}`, action: "check_video" };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id, project_name, platforms, video_id } = await req.json();
    const list: Platform[] = Array.isArray(platforms) ? platforms : ["instagram", "facebook", "youtube", "tiktok"];

    const checks = await Promise.all(list.map(async (p) => {
      if (p === "instagram") return await checkInstagram(project_id ?? null, project_name ?? null);
      if (p === "facebook") return await checkFacebook(project_id ?? null);
      if (p === "youtube") return await checkYouTube(project_name ?? null);
      if (p === "tiktok") return await checkTikTok(project_name ?? null);
      return null;
    }));
    const videoBlocker = await checkVideoAsset(video_id ?? null);
    const blockers = [...checks, videoBlocker].filter(Boolean) as Blocker[];

    return new Response(JSON.stringify({ ok: blockers.length === 0, blockers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

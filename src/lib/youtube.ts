// Helper client-side para as edge functions do YouTube (multi-canal).
import { supabase } from "@/integrations/supabase/client";

export type YoutubeAccount = string; // channel_id ou slug legado ("default")

export type YoutubeCredential = {
  account: string;
  channel_id: string | null;
  channel_title: string | null;
  thumbnail: string | null;
  expires_at: string | null;
  scope: string | null;
  status: string | null;
  label: string | null;
  last_validated_at: string | null;
  last_validation_status: string | null;
  last_validation_detail: string | null;
  updated_at: string;
};

async function invoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const anyErr = error as any;
    const details = typeof anyErr?.context?.text === "function" ? await anyErr.context.text() : error.message;
    throw new Error(details || "Falha ao chamar função do YouTube.");
  }
  if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
  return data as T;
}

export async function listYoutubeChannels(): Promise<YoutubeCredential[]> {
  const { data, error } = await supabase
    .from("youtube_credentials" as any)
    .select(
      "account, channel_id, channel_title, thumbnail, expires_at, scope, status, label, last_validated_at, last_validation_status, last_validation_detail, updated_at",
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]) as YoutubeCredential[];
}

// Compat: alguns componentes ainda usam a assinatura em map.
export async function listYoutubeCredentials(): Promise<Record<string, YoutubeCredential>> {
  const arr = await listYoutubeChannels();
  const map: Record<string, YoutubeCredential> = {};
  for (const c of arr) map[c.account] = c;
  return map;
}

/**
 * Inicia OAuth. Passe `account` para reconectar um canal específico; omita
 * (ou passe "new") para conectar um canal adicional (a callback grava um
 * novo registro usando o channel_id retornado pelo Google).
 */
export async function startYoutubeAuth(account?: YoutubeAccount): Promise<string> {
  const res = await invoke<{ auth_url: string }>("youtube-auth", { account: account ?? "new" });
  return res.auth_url;
}

export async function disconnectYoutube(account: YoutubeAccount) {
  await invoke("youtube-disconnect", { account });
}

export function refreshYoutubeToken(account: YoutubeAccount) {
  return invoke("youtube-refresh-token", { account });
}

export type YoutubeUploadInput = {
  account?: YoutubeAccount;
  video_id?: string;
  storage_bucket?: string;
  storage_path?: string;
  title: string;
  description?: string;
  tags?: string[];
  category_id?: string;
  privacy_status?: "private" | "unlisted" | "public";
};

export function uploadToYoutube(input: YoutubeUploadInput) {
  return invoke<{ success: boolean; video_id: string; url: string | null }>("youtube-upload", input as any);
}

export async function listLibraryVideos(limit = 50) {
  const { data, error } = await supabase
    .from("videos")
    .select("id, filename, original_path, thumbnail_url, duration_seconds, created_at")
    .not("original_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Helper client-side para as edge functions do YouTube.
import { supabase } from "@/integrations/supabase/client";

export type YoutubeAccount = "default";

export const YOUTUBE_ACCOUNTS: { value: YoutubeAccount; label: string }[] = [
  { value: "default", label: "Canal principal" },
];

export type YoutubeCredential = {
  account: YoutubeAccount;
  channel_id: string | null;
  channel_title: string | null;
  thumbnail: string | null;
  expires_at: string | null;
  scope: string | null;
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

export async function listYoutubeCredentials(): Promise<Record<YoutubeAccount, YoutubeCredential | undefined>> {
  const { data, error } = await supabase
    .from("youtube_credentials" as any)
    .select("account, channel_id, channel_title, thumbnail, expires_at, scope, last_validated_at, last_validation_status, last_validation_detail, updated_at");
  if (error) throw error;
  const map = {} as Record<YoutubeAccount, YoutubeCredential | undefined>;
  for (const row of (data ?? []) as any[]) map[row.account as YoutubeAccount] = row as YoutubeCredential;
  return map;
}

export async function startYoutubeAuth(account: YoutubeAccount = "default"): Promise<string> {
  const res = await invoke<{ auth_url: string }>("youtube-auth", { account });
  return res.auth_url;
}

export async function disconnectYoutube(account: YoutubeAccount = "default") {
  const { error } = await supabase.from("youtube_credentials" as any).delete().eq("account", account);
  if (error) throw error;
}

export function refreshYoutubeToken(account: YoutubeAccount = "default") {
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

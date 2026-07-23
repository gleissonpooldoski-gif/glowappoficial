// Comunicação com o módulo Facebook (Meta Graph API via Edge Functions).
import { supabase } from "@/integrations/supabase/client";

export type FacebookPostStatus = "AGENDADO" | "PUBLICANDO" | "PUBLICADO" | "ERRO" | "CANCELADO";

export type FacebookPost = {
  id: string;
  project_id: string | null;
  facebook_account_id: string | null;
  page_id: string;
  page_name: string | null;
  video_id: string | null;
  description: string;
  video_url: string | null;
  fb_video_id: string | null;
  status: FacebookPostStatus;
  error_message: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  logs: any[];
  meta_response: any;
};

export type CreateFacebookPostParams = {
  project_id: string;
  video_id: string;
  description: string;
  publish_now?: boolean;
  scheduled_at?: string | null;
};

async function invoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const anyErr = error as any;
    const details = typeof anyErr?.context?.text === "function"
      ? await anyErr.context.text()
      : error.message;
    throw new Error(details || "Falha ao chamar publish-facebook.");
  }
  if ((data as any)?.error && !(data as any)?.success) {
    throw new Error((data as any).error);
  }
  return data as T;
}

export function createFacebookPost(params: CreateFacebookPostParams) {
  return invoke("publish-facebook", { action: "create", ...params });
}

/** Retorna se o projeto tem uma Página do Facebook conectada. */
export async function getFacebookAccountForProject(projectId: string) {
  const { data } = await supabase
    .from("facebook_accounts" as any)
    .select("id, page_id, page_name, page_picture")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data ?? null) as any;
}

export async function listFacebookPosts(): Promise<FacebookPost[]> {
  const { data, error } = await supabase
    .from("facebook_posts" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as FacebookPost[];
}

export function friendlyFacebookError(e: any): string {
  const msg = (e?.message ?? String(e ?? "")).toLowerCase();
  if (msg.includes("page not published") || msg.includes("página não")) return "A Página do Facebook não está publicada. Publique-a antes de agendar vídeos.";
  if (msg.includes("token")) return "Token da Página do Facebook expirado. Reconecte a Página em Configurações.";
  if (msg.includes("permission") || msg.includes("scope")) return "Permissão insuficiente. O Page Access Token precisa dos escopos pages_manage_posts e pages_read_engagement.";
  if (msg.includes("file_url") || msg.includes("video")) return "Erro ao processar o vídeo no Facebook. Verifique formato e tamanho.";
  return e?.message ?? "Erro desconhecido ao publicar no Facebook.";
}

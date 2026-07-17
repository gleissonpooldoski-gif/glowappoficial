// Centraliza toda comunicação com a Instagram Graph API via Edge Functions.
import { supabase } from "@/integrations/supabase/client";

export type InstagramAccount = "resenha" | "frame";

export const ACCOUNTS: { value: InstagramAccount; label: string }[] = [
  { value: "resenha", label: "Sessão da Resenha" },
  { value: "frame", label: "Sessão da Frame" },
];

/**
 * Deriva a plataforma de publicação a partir do projeto ativo.
 * O nome/categoria do projeto define automaticamente a conta (frame/resenha).
 */
export function platformFromProject(
  p?: { name?: string | null; category?: string | null } | null,
): InstagramAccount | null {
  const raw = `${p?.category ?? ""} ${p?.name ?? ""}`.toLowerCase();
  if (raw.includes("frame")) return "frame";
  if (raw.includes("resenha")) return "resenha";
  return null;
}

export const PLATFORM_LABEL: Record<InstagramAccount, string> = {
  frame: "FRAME",
  resenha: "RESENHA",
};

export type InstagramPost = {
  id: string;
  video_id: string | null;
  account: InstagramAccount;
  caption: string;
  hashtags: string;
  publish_id: string | null;
  container_id: string | null;
  status: "AGENDADO" | "PUBLICANDO" | "PUBLICADO" | "ERRO";
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  logs: any[];
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishParams = {
  account: InstagramAccount;
  videoId: string;
  caption: string;
  hashtags: string;
  publishNow: boolean;
  scheduledAt?: string | null;
};

async function invoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const anyErr = error as any;
    const details =
      typeof anyErr?.context?.text === "function" ? await anyErr.context.text() : error.message;
    throw new Error(details || "Falha ao chamar a função.");
  }
  if ((data as any)?.error && !(data as any)?.success) {
    throw new Error((data as any).error);
  }
  return data as T;
}

export function publishInstagram(params: PublishParams) {
  return invoke("publish-instagram", params);
}

export function getInstagramStatus(postId: string) {
  return invoke("instagram-status", { postId });
}

export async function listInstagramPosts() {
  const { data, error } = await supabase
    .from("instagram_posts" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as InstagramPost[];
}

export function friendlyError(e: any): string {
  const msg = (e?.message ?? String(e ?? "")).toLowerCase();
  if (msg.includes("access blocked") || msg.includes("acesso bloqueado") || msg.includes("code=200"))
    return "Acesso bloqueado pela Meta. Verifique as permissões do app no Facebook Developer ou reconecte a conta do Instagram.";
  if (msg.includes("token")) return "Token do Instagram inválido ou expirado.";
  if (msg.includes("timeout")) return "Tempo esgotado aguardando a Meta processar o vídeo.";
  if (msg.includes("credenciais")) return "Credenciais da conta não configuradas nos Secrets.";
  if (msg.includes("container")) return "A Meta não conseguiu processar o vídeo (container).";
  if (msg.includes("upload")) return "Erro de upload do vídeo para o Instagram.";
  if (msg.includes("url")) return "Não foi possível gerar uma URL válida do vídeo.";
  return e?.message ?? "Erro desconhecido ao publicar no Instagram.";
}

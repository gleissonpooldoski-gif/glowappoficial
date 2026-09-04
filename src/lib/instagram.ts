// Centraliza toda comunicação com a Instagram Graph API via Edge Functions.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Slug da conta no Instagram (ex.: "frame", "resenha", "segredo_da_promocao").
// Aceita qualquer string cadastrada em `instagram_credentials.account`.
export type InstagramAccount = string;

export const ACCOUNTS: { value: InstagramAccount; label: string }[] = [
  { value: "resenha", label: "Sessão da Resenha" },
  { value: "frame", label: "Sessão da Frame" },
];

/**
 * Fallback síncrono legado — deriva a conta a partir do nome/categoria do projeto.
 * Mantido apenas para compatibilidade; prefira `useIgAccountForProject`.
 */
export function platformFromProject(
  p?: { name?: string | null; category?: string | null } | null,
): InstagramAccount | null {
  const raw = `${p?.category ?? ""} ${p?.name ?? ""}`.toLowerCase();
  if (raw.includes("frame")) return "frame";
  if (raw.includes("resenha")) return "resenha";
  return null;
}

export const PLATFORM_LABEL: Record<string, string> = {
  frame: "FRAME",
  resenha: "RESENHA",
};

export function platformLabelFor(account: string | null | undefined, displayName?: string | null) {
  if (!account) return "—";
  return displayName || PLATFORM_LABEL[account] || account.toUpperCase();
}

/**
 * Resolve a conta Instagram vinculada a um projeto consultando `instagram_credentials.project_id`.
 * Retorna { account, displayName, loading }.
 */
export function useIgAccountForProject(projectId: string | null | undefined) {
  const [account, setAccount] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!projectId);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setAccount(null); setDisplayName(null); setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase.functions.invoke("instagram-credentials", { body: { action: "get" } });
      if (cancelled) return;
      const creds = (data?.credentials ?? {}) as Record<string, { account: string; display_name: string | null; project_id: string | null }>;
      const match = Object.values(creds).find((c) => c.project_id === projectId);
      setAccount(match?.account ?? null);
      setDisplayName(match?.display_name ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return { account, displayName, loading };
}

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
  // Pendentes/erros: sempre TODOS (o usuário precisa ver cada agendamento).
  const pending = await supabase
    .from("instagram_posts" as any)
    .select("*")
    .in("status", ["AGENDADO", "PUBLICANDO", "ERRO"])
    .order("scheduled_at", { ascending: true })
    .limit(2000);
  if (pending.error) throw pending.error;

  // Publicados: histórico recente.
  const published = await supabase
    .from("instagram_posts" as any)
    .select("*")
    .eq("status", "PUBLICADO")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (published.error) throw published.error;

  return [
    ...((pending.data ?? []) as unknown as InstagramPost[]),
    ...((published.data ?? []) as unknown as InstagramPost[]),
  ];
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

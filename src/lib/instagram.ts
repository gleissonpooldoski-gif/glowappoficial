// Centraliza toda comunicação com a Instagram Graph API via Edge Functions.
import { supabase } from "@/integrations/supabase/client";

export type InstagramAccount = string;

export type InstagramAccountInfo = {
  account: InstagramAccount;
  display_name: string;
  project_id: string | null;
  ig_business_id?: string | null;
  last_validation_status?: string | null;
  last_validated_at?: string | null;
};

// Contas "legadas" reconhecidas por nome/categoria de projeto quando não há vínculo explícito.
export const LEGACY_ACCOUNTS: { value: InstagramAccount; label: string }[] = [
  { value: "resenha", label: "Sessão da Resenha" },
  { value: "frame", label: "Sessão da Frame" },
];

// Compat: mantido como fallback quando o carregamento dinâmico ainda não ocorreu.
export const ACCOUNTS = LEGACY_ACCOUNTS;

// Cache em memória das contas configuradas no backend (usado por callers síncronos).
let ACCOUNT_CACHE: InstagramAccountInfo[] = [];
const listeners = new Set<(accounts: InstagramAccountInfo[]) => void>();

export function getCachedInstagramAccounts(): InstagramAccountInfo[] {
  return ACCOUNT_CACHE;
}

export function subscribeInstagramAccounts(cb: (accounts: InstagramAccountInfo[]) => void) {
  listeners.add(cb);
  cb(ACCOUNT_CACHE);
  return () => listeners.delete(cb);
}

export async function fetchInstagramAccounts(): Promise<InstagramAccountInfo[]> {
  const { data, error } = await supabase.functions.invoke("instagram-credentials", { body: { action: "get" } });
  if (error) throw new Error(error.message);
  const list: InstagramAccountInfo[] = (data?.accounts ?? []).map((r: any) => ({
    account: r.account,
    display_name: r.display_name ?? r.account,
    project_id: r.project_id ?? null,
    ig_business_id: r.ig_business_id ?? null,
    last_validation_status: r.last_validation_status ?? null,
    last_validated_at: r.last_validated_at ?? null,
  }));
  ACCOUNT_CACHE = list;
  listeners.forEach((cb) => cb(list));
  return list;
}

export async function addInstagramAccount(payload: {
  display_name: string;
  account?: string;
  ig_business_id: string;
  access_token: string;
  project_id?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("instagram-credentials", {
    body: { action: "add", ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  await fetchInstagramAccounts();
  return data;
}

export async function deleteInstagramAccount(account: InstagramAccount) {
  const { data, error } = await supabase.functions.invoke("instagram-credentials", {
    body: { action: "delete", account },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  await fetchInstagramAccounts();
  return data;
}

/**
 * Deriva a plataforma de publicação a partir do projeto ativo.
 * 1) Se alguma credencial do IG estiver vinculada explicitamente ao project.id, usa ela.
 * 2) Caso contrário, cai no matching legado por nome/categoria (frame/resenha).
 */
export function platformFromProject(
  p?: { id?: string | null; name?: string | null; category?: string | null } | null,
): InstagramAccount | null {
  if (!p) return null;
  if (p.id) {
    const linked = ACCOUNT_CACHE.find((a) => a.project_id === p.id);
    if (linked) return linked.account;
  }
  const raw = `${p.category ?? ""} ${p.name ?? ""}`.toLowerCase();
  if (raw.includes("frame")) return "frame";
  if (raw.includes("resenha")) return "resenha";
  return null;
}

export const LEGACY_PLATFORM_LABEL: Record<string, string> = {
  frame: "FRAME",
  resenha: "RESENHA",
};

export function labelForAccount(account: InstagramAccount): string {
  const cached = ACCOUNT_CACHE.find((a) => a.account === account);
  if (cached) return cached.display_name;
  return LEGACY_PLATFORM_LABEL[account] ?? account;
}

// Compat: mantém o objeto usado em vários lugares como Record<string,string>.
export const PLATFORM_LABEL = new Proxy({} as Record<string, string>, {
  get: (_t, key: string) => labelForAccount(key),
});

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

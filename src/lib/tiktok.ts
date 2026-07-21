// Helper client-side para as edge functions do TikTok.
import { supabase } from "@/integrations/supabase/client";

export type TiktokAccount = "resenha" | "frame";

export const TIKTOK_ACCOUNTS: { value: TiktokAccount; label: string }[] = [
  { value: "resenha", label: "SESSÃO DA RESENHA" },
  { value: "frame", label: "SESSÃO DA FRAME" },
];

export type TiktokCredential = {
  account: TiktokAccount;
  open_id: string | null;
  username: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
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
    throw new Error(details || "Falha ao chamar função do TikTok.");
  }
  if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
  return data as T;
}

export async function listTiktokCredentials(): Promise<Record<TiktokAccount, TiktokCredential | undefined>> {
  const { data, error } = await supabase
    .from("tiktok_credentials" as any)
    .select("account, open_id, username, expires_at, refresh_expires_at, scope, last_validated_at, last_validation_status, last_validation_detail, updated_at");
  if (error) throw error;
  const map = {} as Record<TiktokAccount, TiktokCredential | undefined>;
  for (const row of (data ?? []) as any[]) map[row.account as TiktokAccount] = row as TiktokCredential;
  return map;
}

export async function startTiktokAuth(account: TiktokAccount): Promise<string> {
  const res = await invoke<{ auth_url: string }>("tiktok-auth", { account });
  return res.auth_url;
}

export async function disconnectTiktok(account: TiktokAccount) {
  const { error } = await supabase.from("tiktok_credentials" as any).delete().eq("account", account);
  if (error) throw error;
}

export function refreshTiktokToken(account?: TiktokAccount) {
  return invoke("tiktok-refresh-token", account ? { account } : {});
}

export function publishTiktok(params: {
  videoId: string;
  account: TiktokAccount;
  caption: string;
  scheduledAt?: string | null;
  privacy_level?: "SELF_ONLY" | "MUTUAL_FOLLOW_FRIENDS" | "PUBLIC_TO_EVERYONE";
}) {
  return invoke("tiktok-publish", params);
}

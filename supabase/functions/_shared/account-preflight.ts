// Pré-flight de credenciais: valida se a conta da plataforma pode publicar
// ANTES de qualquer transferência do vídeo (economia de egress).
// Retorna null quando está tudo certo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type PreflightPlatform = "instagram" | "facebook" | "youtube" | "tiktok";

export interface AccountBlocker {
  code: string;
  reason: string;
  action: "reconnect" | "link_account";
}

async function healthExpired(
  c: SupabaseClient,
  platform: string,
  accountRef: string,
): Promise<boolean> {
  const { data } = await c
    .from("connection_health")
    .select("status")
    .eq("platform", platform)
    .eq("account_ref", accountRef)
    .maybeSingle();
  return data?.status === "expired";
}

async function projectName(c: SupabaseClient, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await c.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data as any)?.name ?? null;
}

/**
 * Valida a credencial da plataforma. Só bloqueia em casos inequívocos:
 * credencial ausente/sem token, ou connection_health marcado como "expired".
 * Qualquer dúvida → deixa passar (não bloquear publicação válida).
 */
export async function checkAccountReady(
  c: SupabaseClient,
  platform: PreflightPlatform,
  opts: { projectId?: string | null; accountRef?: string | null },
): Promise<AccountBlocker | null> {
  const projectId = opts.projectId ?? null;
  const account = opts.accountRef ?? (await projectName(c, projectId));

  if (platform === "facebook") {
    if (!projectId) return null; // sem vínculo identificável: não bloqueia
    const { data } = await c
      .from("facebook_accounts")
      .select("page_id, page_access_token, connection_status")
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) {
      return { code: "ACCOUNT_NOT_LINKED", reason: "Página do Facebook não vinculada ao projeto.", action: "link_account" };
    }
    if (!data.page_id || !data.page_access_token) {
      return { code: "ACCOUNT_NOT_CONNECTED", reason: "Facebook sem token da Página. Reconecte a conta.", action: "reconnect" };
    }
    if (data.connection_status === "expired" || data.connection_status === "disconnected") {
      return { code: "TOKEN_EXPIRED", reason: "Token do Facebook expirado. Reconecte a Página.", action: "reconnect" };
    }
    return null;
  }

  if (!account) return null;

  const table =
    platform === "instagram" ? "instagram_credentials" :
    platform === "youtube" ? "youtube_credentials" : "tiktok_credentials";
  const tokenCol = platform === "youtube" ? "refresh_token" : "access_token";

  const { data } = await c.from(table).select(`account, ${tokenCol}`).eq("account", account).maybeSingle();
  if (!data) {
    return { code: "ACCOUNT_NOT_LINKED", reason: `Conta ${platform} não vinculada ao projeto.`, action: "link_account" };
  }
  if (!(data as any)[tokenCol]) {
    return { code: "ACCOUNT_NOT_CONNECTED", reason: `Conta ${platform} sem token válido. Reconecte.`, action: "reconnect" };
  }
  if (await healthExpired(c, platform, account)) {
    return { code: "TOKEN_EXPIRED", reason: `Token do ${platform} expirado. Reconecte a conta.`, action: "reconnect" };
  }
  return null;
}

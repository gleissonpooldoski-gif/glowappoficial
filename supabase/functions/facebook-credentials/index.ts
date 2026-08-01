// Facebook Pages integration (etapa 1: apenas conexão de página, sem publicar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TOKEN_EXPIRED_MESSAGE = "Token Facebook expirado. Reconecte a Página.";
const INVALID_FACEBOOK_CONNECTION_MESSAGE = "Facebook não conectado ou token expirado. Reconecte sua Página antes de agendar.";

function sanitizeToken(raw: string | undefined | null): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  t = t.replace(/[^\x21-\x7E]/g, "");
  return t.trim();
}

async function readMeta(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function isTokenExpired(data: any): boolean {
  const err = data?.error;
  return Number(err?.code) === 190 || String(err?.message ?? "").toLowerCase().includes("token") && String(err?.message ?? "").toLowerCase().includes("expir");
}

async function validatePageToken(pageId: string, pageToken: string): Promise<{ ok: boolean; message?: string; meta?: any }> {
  const cleanToken = sanitizeToken(pageToken);
  if (!pageId || !cleanToken) return { ok: false, message: INVALID_FACEBOOK_CONNECTION_MESSAGE };
  const r = await fetch(`${FB_BASE}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`);
  const { data } = await readMeta(r);
  if (!r.ok || data?.error) {
    return {
      ok: false,
      message: isTokenExpired(data) ? TOKEN_EXPIRED_MESSAGE : (data?.error?.message ?? INVALID_FACEBOOK_CONNECTION_MESSAGE),
      meta: data,
    };
  }
  if (String(data?.id ?? "") !== String(pageId)) {
    return { ok: false, message: "Page ID retornado pela Meta não confere com a Página selecionada.", meta: data };
  }
  return { ok: true, meta: data };
}

type PageInfo = {
  page_id: string;
  page_name: string;
  page_picture: string | null;
  page_access_token: string;
};

async function recoverFacebookSchedules(supabase: any, projectId: string): Promise<number> {
  const { data: rows, error } = await supabase
    .from("facebook_posts")
    .select("id, logs")
    .eq("project_id", projectId)
    .eq("status", "ERRO")
    .not("scheduled_at", "is", null)
    .or("error_message.ilike.%token%,error_message.ilike.%expirado%,error_message.ilike.%Página do Facebook não conectada%,error_message.ilike.%Página não conectada%,error_message.ilike.%OAuthException%,error_message.ilike.%code=190%");

  if (error) {
    console.error("[facebook-credentials] recover query failed", { project_id: projectId, error: error.message });
    return 0;
  }

  let recovered = 0;
  for (const row of rows ?? []) {
    const logs = Array.isArray((row as any).logs) ? (row as any).logs : [];
    logs.push({ at: new Date().toISOString(), event: "facebook_retry_enabled_after_reconnect" });
    const { error: updErr } = await supabase
      .from("facebook_posts")
      .update({ status: "AGENDADO", error_message: null, meta_response: null, logs })
      .eq("id", (row as any).id);
    if (updErr) {
      console.error("[facebook-credentials] recover update failed", { id: (row as any).id, error: updErr.message });
    } else {
      recovered++;
    }
  }
  return recovered;
}

/**
 * Troca um token curto (1-2h, típico do Graph Explorer) por um token de usuário
 * de longa duração (60 dias). Os Page Access Tokens derivados de um token de
 * usuário long-lived NÃO expiram — é isso que impede a desconexão constante.
 */
async function exchangeForLongLivedUserToken(token: string): Promise<{ token: string; exchanged: boolean; reason?: string }> {
  const appId = Deno.env.get("FACEBOOK_APP_ID");
  const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");
  if (!appId || !appSecret) {
    return { token, exchanged: false, reason: "missing_app_credentials" };
  }
  try {
    const url = `${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const { data } = await readMeta(r);
    if (!r.ok || data?.error || !data?.access_token) {
      console.error("[facebook-credentials] long-lived exchange failed", data?.error ?? data);
      return { token, exchanged: false, reason: data?.error?.message ?? "exchange_failed" };
    }
    console.info("[facebook-credentials] long-lived token obtido", { expires_in: data?.expires_in ?? "never" });
    return { token: sanitizeToken(data.access_token), exchanged: true };
  } catch (e) {
    return { token, exchanged: false, reason: (e as Error).message };
  }
}

async function fetchMe(token: string): Promise<{ id: string; name: string }> {
  const r = await fetch(`${FB_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const { data } = await readMeta(r);
  if (data?.error) throw new Error(data.error.message ?? "Token inválido.");
  return { id: data.id, name: data.name };
}

async function fetchPages(token: string): Promise<PageInfo[]> {
  const url = `${FB_BASE}/me/accounts?fields=id,name,access_token,picture{url}&limit=200&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const { data } = await readMeta(r);
  if (data?.error) throw new Error(data.error.message ?? "Falha ao listar Páginas.");
  const list = (data?.data ?? []) as any[];
  return list.map((p) => ({
    page_id: String(p.id),
    page_name: String(p.name ?? ""),
    page_picture: p.picture?.data?.url ?? null,
    page_access_token: String(p.access_token ?? ""),
  }));
}

async function validateStoredAccounts(supabase: any) {
  const { data: accounts, error } = await supabase
    .from("facebook_accounts")
    .select("id, project_id, page_id, page_name, page_picture, connected_at, created_at, updated_at, connection_logs, connection_status, token_checked_at, token_error, page_access_token")
    .order("created_at", { ascending: true });
  if (error) throw error;

  let pages_checked = 0;
  let pages_marked_expired = 0;
  let pages_marked_connected = 0;

  const validated = await Promise.all((accounts ?? []).map(async (account: any) => {
    pages_checked++;
    const tokenCheck = await validatePageToken(account.page_id, account.page_access_token);
    const now = new Date().toISOString();
    const nextStatus = tokenCheck.ok ? "connected" : "expired";
    const tokenError = tokenCheck.ok ? null : (tokenCheck.message ?? INVALID_FACEBOOK_CONNECTION_MESSAGE);

    if (nextStatus === "expired" && account.connection_status !== "expired") pages_marked_expired++;
    if (nextStatus === "connected" && account.connection_status !== "connected") pages_marked_connected++;

    const { data: updated, error: updateError } = await supabase
      .from("facebook_accounts")
      .update({ connection_status: nextStatus, token_checked_at: now, token_error: tokenError })
      .eq("id", account.id)
      .select("id, project_id, page_id, page_name, page_picture, connected_at, created_at, updated_at, connection_logs, connection_status, token_checked_at, token_error")
      .maybeSingle();
    if (updateError) {
      console.error("[facebook-credentials] validate update failed", { id: account.id, error: updateError.message });
      const { page_access_token, ...safeAccount } = account;
      return safeAccount;
    }
    return updated;
  }));

  return { accounts: validated, pages_checked, pages_marked_expired, pages_marked_connected };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action: string = body.action ?? "list";

    // === LIST connected accounts ===
    if (action === "list") {
      if (body.validate === true) {
        const result = await validateStoredAccounts(supabase);
        console.info("[facebook-credentials] validate list", {
          pages_checked: result.pages_checked,
          pages_marked_expired: result.pages_marked_expired,
          pages_marked_connected: result.pages_marked_connected,
        });
        return json({ success: true, ...result });
      }
      const { data, error } = await supabase
        .from("facebook_accounts")
        .select("id, project_id, page_id, page_name, page_picture, connected_at, created_at, updated_at, connection_logs, connection_status, token_checked_at, token_error")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ success: true, accounts: data ?? [] });
    }

    // === LIST_PAGES: given a user access token, returns pages the user manages ===
    if (action === "list_pages") {
      const token = sanitizeToken(body.user_access_token);
      if (!token) return json({ error: "Access token do Meta é obrigatório." }, 400);
      const me = await fetchMe(token);
      const pages = await fetchPages(token);
      return json({ success: true, me, pages });
    }

    // === CONNECT: save a chosen page for a project ===
    if (action === "connect") {
      const project_id: string | null = body.project_id ?? null;
      const user_token = sanitizeToken(body.user_access_token);
      const page_id = String(body.page_id ?? "").trim();
      if (!project_id) return json({ error: "Projeto é obrigatório." }, 400);
      if (!user_token) return json({ error: "Access token do Meta é obrigatório." }, 400);
      if (!page_id) return json({ error: "Selecione uma Página." }, 400);

      const me = await fetchMe(user_token);
      const pages = await fetchPages(user_token);
      const chosen = pages.find((p) => p.page_id === page_id);
      if (!chosen) return json({ error: "Página não encontrada nas Páginas administradas por este token." }, 400);
      if (!chosen.page_access_token) {
        return json({ error: "A Página não retornou um Page Access Token. Verifique as permissões pages_show_list, pages_read_engagement e pages_manage_posts." }, 400);
      }

      const tokenCheck = await validatePageToken(chosen.page_id, chosen.page_access_token);
      if (!tokenCheck.ok) {
        return json({ error: tokenCheck.message ?? INVALID_FACEBOOK_CONNECTION_MESSAGE, meta: tokenCheck.meta ?? null }, 400);
      }

      const now = new Date().toISOString();
      const logs = [
        { at: now, event: "meta_login_ok", meta_user_id: me.id, meta_user_name: me.name },
        { at: now, event: "page_selected", page_id: chosen.page_id, page_name: chosen.page_name },
      ];

      const payload = {
        project_id,
        page_id: chosen.page_id,
        page_name: chosen.page_name,
        page_picture: chosen.page_picture,
        page_access_token: chosen.page_access_token,
        user_access_token: user_token,
        connection_status: "connected",
        token_checked_at: now,
        token_error: null,
        connected_at: now,
        connection_logs: logs,
      };

      const { data, error } = await supabase
        .from("facebook_accounts")
        .upsert(payload, { onConflict: "project_id" })
        .select("id, project_id, page_id, page_name, page_picture, connected_at, connection_status, token_checked_at, token_error")
        .maybeSingle();
      if (error) throw error;
      const recovered_count = await recoverFacebookSchedules(supabase, project_id);
      console.info("[facebook-credentials] reconnect ok", {
        project_id,
        page_id: chosen.page_id,
        token_valid: true,
        recovered_count,
      });
      return json({ success: true, account: data, recovered_count });
    }

    // === DISCONNECT: remove a facebook account row ===
    if (action === "disconnect") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "ID ausente." }, 400);
      const { error } = await supabase.from("facebook_accounts").delete().eq("id", id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado." }, 500);
  }
});

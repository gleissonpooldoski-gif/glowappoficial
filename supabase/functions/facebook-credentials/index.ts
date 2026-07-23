// Facebook Pages integration (etapa 1: apenas conexão de página, sem publicar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

type PageInfo = {
  page_id: string;
  page_name: string;
  page_picture: string | null;
  page_access_token: string;
};

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
      const { data, error } = await supabase
        .from("facebook_accounts")
        .select("id, project_id, page_id, page_name, page_picture, connected_at, created_at, updated_at, connection_logs")
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
        connected_at: now,
        connection_logs: logs,
      };

      const { data, error } = await supabase
        .from("facebook_accounts")
        .upsert(payload, { onConflict: "project_id" })
        .select("id, project_id, page_id, page_name, page_picture, connected_at")
        .maybeSingle();
      if (error) throw error;
      return json({ success: true, account: data });
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

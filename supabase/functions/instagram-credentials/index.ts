// Salva e valida credenciais da Instagram Graph API para múltiplas contas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v25.0";

type ValidationResult = {
  ok: boolean;
  status: "VALID" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "IG_ID_INVALID" | "PERMISSION_MISSING" | "API_BLOCKED" | "UNKNOWN_ERROR" | "EMPTY";
  message: string;
  username?: string | null;
  account_type?: string | null;
};

function isApiBlocked(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "").toLowerCase();
  if (Number(err.code) === 200) return true;
  if (msg.includes("api access blocked")) return true;
  if (msg.includes("access blocked") && msg.includes("api")) return true;
  return false;
}

const BLOCKED_MSG = "Acesso bloqueado pela Meta. Verifique as permissões do app no Facebook Developer ou reconecte a conta do Instagram.";

async function readMeta(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, text };
}

function slugify(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function validateAccount(token: string, igId: string): Promise<ValidationResult> {
  if (!token || !igId) {
    return { ok: false, status: "EMPTY", message: "Access Token ou Instagram Business ID vazio." };
  }
  try {
    const debugRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
    const debug = await readMeta(debugRes);
    const info = debug.data?.data;
    if (info?.is_valid === false) {
      const expired = info?.expires_at && Number(info.expires_at) > 0 && Number(info.expires_at) * 1000 < Date.now();
      return { ok: false, status: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID", message: info?.error?.message ?? "Token inválido." };
    }
  } catch (_) { /* segue */ }

  try {
    const permRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`);
    const perm = await readMeta(permRes);
    if (perm.data?.error) {
      const code = perm.data.error.code;
      if (isApiBlocked(perm.data.error)) return { ok: false, status: "API_BLOCKED", message: `${BLOCKED_MSG} (${perm.data.error.message ?? ""})` };
      if (code === 190) return { ok: false, status: "TOKEN_EXPIRED", message: perm.data.error.message ?? "Token expirado." };
      return { ok: false, status: "TOKEN_INVALID", message: perm.data.error.message ?? "Token inválido." };
    }
    const list = Array.isArray(perm.data?.data) ? perm.data.data : [];
    const publish = list.find((p: any) => p?.permission === "instagram_content_publish");
    if (!publish || publish.status !== "granted") {
      return { ok: false, status: "PERMISSION_MISSING", message: "Permissão instagram_content_publish ausente ou não concedida." };
    }
  } catch (e: any) {
    return { ok: false, status: "UNKNOWN_ERROR", message: e?.message ?? "Falha ao validar permissões." };
  }

  try {
    const igRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igId)}?fields=id,username&access_token=${encodeURIComponent(token)}`);
    const ig = await readMeta(igRes);
    if (ig.data?.error) {
      const code = ig.data.error.code;
      if (isApiBlocked(ig.data.error)) return { ok: false, status: "API_BLOCKED", message: `${BLOCKED_MSG} (${ig.data.error.message ?? ""})` };
      if (code === 190) return { ok: false, status: "TOKEN_EXPIRED", message: ig.data.error.message ?? "Token expirado." };
      if (code === 100 || code === 803) return { ok: false, status: "IG_ID_INVALID", message: ig.data.error.message ?? "Instagram Business ID inválido." };
      return { ok: false, status: "IG_ID_INVALID", message: ig.data.error.message ?? "Falha ao ler o Business ID." };
    }
    if (!ig.data?.id) return { ok: false, status: "IG_ID_INVALID", message: "Instagram Business ID não retornou dados." };
    return { ok: true, status: "VALID", message: "Token válido.", username: ig.data.username ?? null, account_type: ig.data.account_type ?? null };
  } catch (e: any) {
    return { ok: false, status: "UNKNOWN_ERROR", message: e?.message ?? "Falha ao consultar o Business ID." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action = body.action ?? new URL(req.url).searchParams.get("action") ?? "get";

    if (action === "get") {
      const { data, error } = await supabase
        .from("instagram_credentials")
        .select("account, display_name, project_id, ig_business_id, last_validated_at, last_validation_status, last_validation_detail, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const map: Record<string, any> = {};
      const list: any[] = [];
      for (const row of data ?? []) {
        const entry = {
          account: row.account,
          display_name: row.display_name ?? row.account,
          project_id: row.project_id ?? null,
          ig_business_id: row.ig_business_id,
          last_validated_at: row.last_validated_at,
          last_validation_status: row.last_validation_status,
          last_validation_detail: row.last_validation_detail,
          updated_at: row.updated_at,
        };
        map[row.account] = entry;
        list.push(entry);
      }
      const envFallback = {
        resenha: !!(Deno.env.get("META_RESENHA_ACCESS_TOKEN") && Deno.env.get("META_RESENHA_INSTAGRAM_ID")),
        frame: !!(Deno.env.get("META_FRAME_ACCESS_TOKEN") && Deno.env.get("META_FRAME_INSTAGRAM_ID")),
      };
      return new Response(JSON.stringify({ success: true, credentials: map, accounts: list, env_fallback: envFallback }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Adiciona uma nova conta (não substitui existentes).
    if (action === "add") {
      const displayName = String(body.display_name ?? "").trim();
      const requestedKey = String(body.account ?? "").trim();
      const igId = String(body.ig_business_id ?? "").trim();
      const token = String(body.access_token ?? "").trim();
      const projectId = body.project_id ? String(body.project_id) : null;

      if (!displayName) {
        return new Response(JSON.stringify({ error: "Informe o nome da conta/projeto." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!igId || !token) {
        return new Response(JSON.stringify({ error: "Access Token e Instagram Business ID são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Gera slug único a partir do nome fornecido.
      let base = slugify(requestedKey || displayName) || "conta";
      let account = base;
      for (let i = 2; i < 100; i++) {
        const { data: exists } = await supabase.from("instagram_credentials").select("account").eq("account", account).maybeSingle();
        if (!exists) break;
        account = `${base}_${i}`;
      }

      const validation = await validateAccount(token, igId);
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase.from("instagram_credentials").insert({
        account,
        display_name: displayName,
        project_id: projectId,
        access_token: token,
        ig_business_id: igId,
        last_validated_at: nowIso,
        last_validation_status: validation.status,
        last_validation_detail: validation.message,
      });
      if (insertError) {
        return new Response(JSON.stringify({ error: `Falha ao salvar: ${insertError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, account, display_name: displayName, result: validation }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const account = String(body.account ?? "").trim();
      if (!account) {
        return new Response(JSON.stringify({ error: "Conta não informada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("instagram_credentials").delete().eq("account", account);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Atualiza credenciais de contas já existentes (não cria novas).
    if (action === "save") {
      const accounts = (body.accounts ?? []) as Array<{ account: string; access_token?: string; ig_business_id?: string; display_name?: string; project_id?: string | null }>;
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhuma conta informada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results: Record<string, ValidationResult> = {};
      for (const item of accounts) {
        const account = String(item.account ?? "").trim();
        if (!account) continue;

        const { data: existing } = await supabase.from("instagram_credentials").select("*").eq("account", account).maybeSingle();
        const token = (item.access_token ?? "").trim() || existing?.access_token || "";
        const igId = (item.ig_business_id ?? "").trim() || existing?.ig_business_id || "";
        const validation = await validateAccount(token, igId);

        const payload: any = { account };
        if ((item.access_token ?? "").trim()) payload.access_token = (item.access_token ?? "").trim();
        if ((item.ig_business_id ?? "").trim()) payload.ig_business_id = (item.ig_business_id ?? "").trim();
        if (item.display_name !== undefined) payload.display_name = item.display_name;
        if (item.project_id !== undefined) payload.project_id = item.project_id;
        payload.last_validated_at = new Date().toISOString();
        payload.last_validation_status = validation.status;
        payload.last_validation_detail = validation.message;

        if (existing) {
          const { error: upErr } = await supabase.from("instagram_credentials").update(payload).eq("account", account);
          if (upErr) { results[account] = { ok: false, status: "UNKNOWN_ERROR", message: `Falha ao salvar: ${upErr.message}` }; continue; }
        } else if (token && igId) {
          const { error: insErr } = await supabase.from("instagram_credentials").insert(payload);
          if (insErr) { results[account] = { ok: false, status: "UNKNOWN_ERROR", message: `Falha ao salvar: ${insErr.message}` }; continue; }
        }
        results[account] = validation;
      }
      return new Response(JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "validate") {
      const account = String(body.account ?? "").trim();
      if (!account) {
        return new Response(JSON.stringify({ error: "Conta inválida." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data } = await supabase.from("instagram_credentials").select("*").eq("account", account).maybeSingle();
      let token = data?.access_token ?? "";
      let igId = data?.ig_business_id ?? "";
      if (!token || !igId) {
        if (account === "resenha") {
          token = token || Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "";
          igId = igId || Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "";
        } else if (account === "frame") {
          token = token || Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "";
          igId = igId || Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "";
        }
      }
      const validation = await validateAccount(token, igId);
      if (data) {
        await supabase.from("instagram_credentials").update({
          last_validated_at: new Date().toISOString(),
          last_validation_status: validation.status,
          last_validation_detail: validation.message,
        }).eq("account", account);
      }
      return new Response(JSON.stringify({ success: true, account, result: validation }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[instagram-credentials]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro desconhecido." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

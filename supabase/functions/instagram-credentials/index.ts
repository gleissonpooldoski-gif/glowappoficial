// Salva e valida credenciais da Instagram Graph API para cada conta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";
type Account = "resenha" | "frame";

type ValidationResult = {
  ok: boolean;
  status: "VALID" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "IG_ID_INVALID" | "PERMISSION_MISSING" | "UNKNOWN_ERROR" | "EMPTY";
  message: string;
  username?: string | null;
  account_type?: string | null;
};

async function readMeta(res: Response) {
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, text };
}

async function validateAccount(token: string, igId: string): Promise<ValidationResult> {
  if (!token || !igId) {
    return { ok: false, status: "EMPTY", message: "Access Token ou Instagram Business ID vazio." };
  }

  // 1) Debug do token
  try {
    const debugRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
    const debug = await readMeta(debugRes);
    const info = debug.data?.data;
    if (info?.is_valid === false) {
      const expired = info?.expires_at && Number(info.expires_at) > 0 && Number(info.expires_at) * 1000 < Date.now();
      return { ok: false, status: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID", message: info?.error?.message ?? "Token inválido." };
    }
  } catch (_) { /* segue validação */ }

  // 2) Permissões
  try {
    const permRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`);
    const perm = await readMeta(permRes);
    if (perm.data?.error) {
      const code = perm.data.error.code;
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

  // 3) Business account
  try {
    const igRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igId)}?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`);
    const ig = await readMeta(igRes);
    if (ig.data?.error) {
      const code = ig.data.error.code;
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
        .select("account, ig_business_id, last_validated_at, last_validation_status, last_validation_detail, updated_at");
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data ?? []) {
        map[row.account] = {
          account: row.account,
          ig_business_id: row.ig_business_id,
          last_validated_at: row.last_validated_at,
          last_validation_status: row.last_validation_status,
          last_validation_detail: row.last_validation_detail,
          updated_at: row.updated_at,
        };
      }
      // Indica se há fallback via env
      const envFallback = {
        resenha: !!(Deno.env.get("META_RESENHA_ACCESS_TOKEN") && Deno.env.get("META_RESENHA_INSTAGRAM_ID")),
        frame: !!(Deno.env.get("META_FRAME_ACCESS_TOKEN") && Deno.env.get("META_FRAME_INSTAGRAM_ID")),
      };
      return new Response(JSON.stringify({ success: true, credentials: map, env_fallback: envFallback }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "save") {
      const accounts = (body.accounts ?? []) as Array<{ account: Account; access_token: string; ig_business_id: string }>;
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhuma conta informada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results: Record<string, ValidationResult> = {};
      for (const item of accounts) {
        const account = item.account;
        if (!["resenha", "frame"].includes(account)) {
          results[account] = { ok: false, status: "UNKNOWN_ERROR", message: "Conta inválida." };
          continue;
        }
        const token = (item.access_token ?? "").trim();
        const igId = (item.ig_business_id ?? "").trim();
        const validation = await validateAccount(token, igId);

        if (token && igId) {
          const nowIso = new Date().toISOString();
          const { error: upsertError } = await supabase.from("instagram_credentials").upsert({
            account,
            access_token: token,
            ig_business_id: igId,
            last_validated_at: nowIso,
            last_validation_status: validation.status,
            last_validation_detail: validation.message,
          }, { onConflict: "account" });
          if (upsertError) {
            results[account] = { ok: false, status: "UNKNOWN_ERROR", message: `Falha ao salvar: ${upsertError.message}` };
            continue;
          }
        }
        results[account] = validation;
      }

      return new Response(JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "validate") {
      const account = body.account as Account;
      if (!["resenha", "frame"].includes(account)) {
        return new Response(JSON.stringify({ error: "Conta inválida." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data } = await supabase.from("instagram_credentials").select("*").eq("account", account).maybeSingle();
      let token = data?.access_token ?? "";
      let igId = data?.ig_business_id ?? "";
      if (!token || !igId) {
        token = token || (account === "resenha" ? Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "" : Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "");
        igId = igId || (account === "resenha" ? Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "" : Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "");
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

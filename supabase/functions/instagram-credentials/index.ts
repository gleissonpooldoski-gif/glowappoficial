// Salva e valida credenciais da Instagram Graph API para cada conta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v25.0";
type ConnectionStatus = "CONNECTED" | "PENDING" | "ERROR";

type ValidationResult = {
  ok: boolean;
  status: "VALID" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "IG_ID_INVALID" | "PERMISSION_MISSING" | "API_BLOCKED" | "UNKNOWN_ERROR" | "EMPTY";
  message: string;
  username?: string | null;
  account_type?: string | null;
};

function connectionStatusFromValidation(validation: ValidationResult): ConnectionStatus {
  return validation.ok ? "CONNECTED" : "ERROR";
}

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

  // 2) Permissões — checa apenas as ESSENCIAIS para publicar.
  // A Meta oferece dois fluxos de login com escopos diferentes:
  //   • Facebook Login for Business: instagram_basic + instagram_content_publish (+ pages_*)
  //   • Instagram API with Instagram Login: instagram_business_basic + instagram_business_content_publish
  // Aceitamos qualquer um. pages_show_list / pages_read_engagement NÃO bloqueiam mais.
  const PUBLISH_SCOPES = ["instagram_content_publish", "instagram_business_content_publish"];
  const BASIC_SCOPES = ["instagram_basic", "instagram_business_basic"];
  let grantedPerms: string[] = [];
  try {
    const permRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`);
    const perm = await readMeta(permRes);
    if (perm.data?.error) {
      const code = perm.data.error.code;
      if (isApiBlocked(perm.data.error)) return { ok: false, status: "API_BLOCKED", message: `${BLOCKED_MSG} (${perm.data.error.message ?? ""})` };
      if (code === 190) return { ok: false, status: "TOKEN_EXPIRED", message: perm.data.error.message ?? "Token expirado." };
      // /me/permissions falha em tokens de Página/System User — seguimos e confiamos no teste do IG ID.
    } else {
      const list = Array.isArray(perm.data?.data) ? perm.data.data : [];
      grantedPerms = list.filter((p: any) => p?.status === "granted").map((p: any) => p.permission);
      const hasPublish = PUBLISH_SCOPES.some((p) => grantedPerms.includes(p));
      const hasBasic = BASIC_SCOPES.some((p) => grantedPerms.includes(p));
      if (grantedPerms.length > 0 && (!hasPublish || !hasBasic)) {
        const need = [!hasBasic && `um de [${BASIC_SCOPES.join(", ")}]`, !hasPublish && `um de [${PUBLISH_SCOPES.join(", ")}]`]
          .filter(Boolean).join(" + ");
        return {
          ok: false,
          status: "PERMISSION_MISSING",
          message: `Permissões essenciais ausentes (${need}). Escopos concedidos: ${grantedPerms.join(", ") || "nenhum"}.`,
        };
      }
    }
  } catch (_) { /* segue para teste do Business ID */ }

  // 3) Business account — busca o IG informado
  try {
    const igRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igId)}?fields=id,username,account_type,ig_id&access_token=${encodeURIComponent(token)}`);
    const ig = await readMeta(igRes);
    if (ig.data?.error) {
      const code = ig.data.error.code;
      const meta = ig.data.error.message ?? "";
      if (isApiBlocked(ig.data.error)) return { ok: false, status: "API_BLOCKED", message: `${BLOCKED_MSG} (${meta})` };
      if (code === 190) return { ok: false, status: "TOKEN_EXPIRED", message: meta || "Token expirado." };

      // Se falhou, lista as contas IG que ESTE token realmente pode acessar (via /me/accounts)
      let accessibleHint = "";
      try {
        const pagesRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=name,instagram_business_account{id,username}&limit=50&access_token=${encodeURIComponent(token)}`);
        const pages = await readMeta(pagesRes);
        const linked: string[] = [];
        for (const p of pages.data?.data ?? []) {
          const iba = p?.instagram_business_account;
          if (iba?.id) linked.push(`• Página "${p.name}" → IG ${iba.id}${iba.username ? ` (@${iba.username})` : ""}`);
        }
        if (linked.length > 0) {
          accessibleHint = `\n\nContas Instagram que este token PODE acessar:\n${linked.join("\n")}\n\nUse um dos IDs acima em vez de ${igId}.`;
        } else {
          accessibleHint = `\n\nEste token não tem NENHUMA conta Instagram Business vinculada a uma Página do Facebook acessível. Verifique se: (a) o usuário do token é admin da Página, (b) a Página está vinculada a uma conta Instagram Profissional, (c) o app da Meta pediu 'pages_show_list' + 'instagram_basic' no login.`;
        }
      } catch { /* ignora */ }

      if (code === 100 || code === 803) {
        return {
          ok: false,
          status: "IG_ID_INVALID",
          message: `${meta}\n\nDiagnóstico: o ID ${igId} não existe OU este token não tem acesso a ele. Confirme que é o Instagram Business/Professional Account ID (não Page ID, User ID ou Business Manager ID) e que o token pertence a um admin da Página vinculada.${accessibleHint}`,
        };
      }
      return { ok: false, status: "IG_ID_INVALID", message: `${meta || "Falha ao ler o Business ID."}${accessibleHint}` };
    }
    if (!ig.data?.id) return { ok: false, status: "IG_ID_INVALID", message: "Instagram Business ID não retornou dados." };
    const accountType = ig.data.account_type ?? null;
    if (accountType && accountType !== "BUSINESS" && accountType !== "MEDIA_CREATOR") {
      return {
        ok: false,
        status: "IG_ID_INVALID",
        message: `Conta encontrada, mas o tipo retornado é "${accountType}". É necessário ser Instagram Profissional (Business ou Creator) para publicar via API.`,
      };
    }
    return { ok: true, status: "VALID", message: `Conta @${ig.data.username ?? "?"} validada (${accountType ?? "OK"}). Permissões OK: ${grantedPerms.filter((p) => REQUIRED_PERMS.includes(p)).join(", ")}.`, username: ig.data.username ?? null, account_type: accountType };
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
        .select("account, ig_business_id, display_name, project_id, connection_status, last_validated_at, last_validation_status, last_validation_detail, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data ?? []) {
        map[row.account] = {
          account: row.account,
          ig_business_id: row.ig_business_id,
          display_name: row.display_name,
          project_id: row.project_id,
          connection_status: row.connection_status ?? "CONNECTED",
          last_validated_at: row.last_validated_at,
          last_validation_status: row.last_validation_status,
          last_validation_detail: row.last_validation_detail,
          updated_at: row.updated_at,
        };
      }
      const envFallback = {
        resenha: !!(Deno.env.get("META_RESENHA_ACCESS_TOKEN") && Deno.env.get("META_RESENHA_INSTAGRAM_ID")),
        frame: !!(Deno.env.get("META_FRAME_ACCESS_TOKEN") && Deno.env.get("META_FRAME_INSTAGRAM_ID")),
      };
      return new Response(JSON.stringify({ success: true, credentials: map, env_fallback: envFallback }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const slugify = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `ig_${Date.now()}`;

    if (action === "save") {
      const accounts = (body.accounts ?? []) as Array<{
        account: string; access_token?: string; ig_business_id?: string;
        display_name?: string; project_id?: string | null;
      }>;
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhuma conta informada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results: Record<string, ValidationResult> = {};
      for (const item of accounts) {
        const account = String(item.account ?? "").trim();
        if (!account) {
          results["_"] = { ok: false, status: "UNKNOWN_ERROR", message: "Slug da conta ausente." };
          continue;
        }

        // Se veio token, valida e faz upsert completo da CONTA INFORMADA apenas.
        // Falha de uma conta nunca altera as demais.
        const token = (item.access_token ?? "").trim();
        const igId = (item.ig_business_id ?? "").trim();

        if (token || igId) {
          const validation = await validateAccount(token, igId);
          if (token && igId) {
            const payload: any = {
              account,
              access_token: token,
              ig_business_id: igId,
              last_validated_at: new Date().toISOString(),
              last_validation_status: validation.status,
              last_validation_detail: validation.message,
              connection_status: connectionStatusFromValidation(validation),
            };
            if (item.display_name !== undefined) payload.display_name = item.display_name;
            if (item.project_id !== undefined) payload.project_id = item.project_id;
            const { error: upsertError } = await supabase.from("instagram_credentials")
              .upsert(payload, { onConflict: "account" });
            if (upsertError) {
              results[account] = { ok: false, status: "UNKNOWN_ERROR", message: `Falha ao salvar: ${upsertError.message}` };
              continue;
            }
          }
          results[account] = validation;
        } else {
          // Apenas metadata
          const patch: any = {};
          if (item.display_name !== undefined) patch.display_name = item.display_name;
          if (item.project_id !== undefined) patch.project_id = item.project_id;
          if (Object.keys(patch).length > 0) {
            await supabase.from("instagram_credentials").update(patch).eq("account", account);
          }
          results[account] = { ok: true, status: "VALID", message: "Metadados atualizados. Status de conexão preservado." };
        }
      }

      return new Response(JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create") {
      const display_name = String(body.display_name ?? "").trim();
      const access_token = String(body.access_token ?? "").trim();
      const ig_business_id = String(body.ig_business_id ?? "").trim();
      const project_id = body.project_id ?? null;
      if (!display_name || !access_token || !ig_business_id) {
        return new Response(JSON.stringify({ error: "Nome, Access Token e Business ID são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Sanity check no formato do ID (dígitos apenas, típico 15-18 chars começando com 178…)
      if (!/^\d{6,20}$/.test(ig_business_id)) {
        return new Response(JSON.stringify({
          error: "Instagram Business ID deve conter apenas dígitos. Copie o valor exato do campo 'Instagram Business Account ID' (não use @username, URL, ou o ID da Página do Facebook).",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Gera slug único. Se já existir uma tentativa pendente/erro com o mesmo nome,
      // reaproveita essa conta para a nova tentativa, sem tocar em contas CONNECTED.
      let base = slugify(display_name);
      let account = base;
      let n = 1;
      while (true) {
        const { data: exists } = await supabase.from("instagram_credentials")
          .select("account, connection_status").eq("account", account).maybeSingle();
        if (!exists) break;
        if (exists.connection_status && exists.connection_status !== "CONNECTED") break;
        n += 1;
        account = `${base}_${n}`;
      }

      // Salva a NOVA conta como PENDING antes da validação para isolar o erro nela.
      // Não atualiza nem revalida contas já conectadas.
      const { error: pendingErr } = await supabase.from("instagram_credentials").upsert({
        account,
        display_name,
        access_token,
        ig_business_id,
        project_id,
        connection_status: "PENDING",
        last_validated_at: new Date().toISOString(),
        last_validation_status: "EMPTY",
        last_validation_detail: "Validação em andamento.",
      }, { onConflict: "account" });
      if (pendingErr) {
        return new Response(JSON.stringify({ error: `Falha ao preparar conta: ${pendingErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const validation = await validateAccount(access_token, ig_business_id);
      const connection_status = connectionStatusFromValidation(validation);
      const { error: saveAttemptErr } = await supabase.from("instagram_credentials").update({
        display_name,
        access_token,
        ig_business_id,
        project_id,
        connection_status,
        last_validated_at: new Date().toISOString(),
        last_validation_status: validation.status,
        last_validation_detail: validation.message,
      }).eq("account", account);
      if (saveAttemptErr) {
        return new Response(JSON.stringify({ error: `Falha ao salvar tentativa: ${saveAttemptErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!validation.ok) {
        return new Response(JSON.stringify({
          error: validation.message,
          status: validation.status,
          connection_status,
          account,
          result: validation,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, account, connection_status, result: validation }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const account = String(body.account ?? "").trim();
      if (!account) {
        return new Response(JSON.stringify({ error: "Conta ausente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: delErr } = await supabase.from("instagram_credentials").delete().eq("account", account);
      if (delErr) {
        return new Response(JSON.stringify({ error: `Falha ao remover: ${delErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true }),
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
          token = token || (Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "");
          igId = igId || (Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "");
        } else if (account === "frame") {
          token = token || (Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "");
          igId = igId || (Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "");
        }
      }
      const validation = await validateAccount(token, igId);
      if (data) {
        await supabase.from("instagram_credentials").update({
          last_validated_at: new Date().toISOString(),
          last_validation_status: validation.status,
          last_validation_detail: validation.message,
          connection_status: connectionStatusFromValidation(validation),
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

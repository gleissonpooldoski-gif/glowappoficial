// Salva e valida credenciais da Instagram Graph API para cada conta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v18.0";
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Sanitiza o Access Token: remove aspas, espaços, quebras de linha, controle
// e QUALQUER caractere fora do ASCII imprimível (necessário para header válido).
function sanitizeToken(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  let t = String(raw).trim().replace(/^["']|["']$/g, "");
  t = t.replace(/[\s\r\n\t]+/g, "");
  t = t.replace(/[\u0000-\u001F\u007F\uFEFF]/g, "");
  t = t.replace(/[^\x21-\x7E]/g, "");
  return t.trim();
}

function isValidTokenFormat(token: string): boolean {
  return !!token && /^[\x21-\x7E]+$/.test(token);
}

type ConnectionStatus = "CONNECTED" | "PENDING" | "ERROR";

type ValidationResult = {
  ok: boolean;
  status: "VALID" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "IG_ID_INVALID" | "PERMISSION_MISSING" | "API_BLOCKED" | "UNKNOWN_ERROR" | "EMPTY";
  message: string;
  username?: string | null;
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

// Diagnóstico extra: descobre quais IG Business Accounts o token consegue acessar
// via /me/accounts?fields=instagram_business_account. Usado somente quando a
// validação principal falhar, para orientar o usuário sobre qual ID usar.
async function discoverAccessibleIgAccounts(token: string): Promise<{
  tokenOwner?: { id?: string; name?: string };
  pages: Array<{ page_id: string; page_name: string; ig_business_account_id?: string; ig_username?: string }>;
  error?: string;
}> {
  const out: { tokenOwner?: { id?: string; name?: string }; pages: any[]; error?: string } = { pages: [] };
  try {
    const meRes = await fetch(`${FB_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const me = await readMeta(meRes);
    if (me.data?.error) { out.error = me.data.error.message; return out; }
    out.tokenOwner = { id: me.data?.id, name: me.data?.name };

    const pagesRes = await fetch(`${FB_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(token)}`);
    const pages = await readMeta(pagesRes);
    if (pages.data?.error) { out.error = pages.data.error.message; return out; }
    for (const p of pages.data?.data ?? []) {
      out.pages.push({
        page_id: p.id,
        page_name: p.name,
        ig_business_account_id: p.instagram_business_account?.id,
        ig_username: p.instagram_business_account?.username,
      });
    }
  } catch (e: any) {
    out.error = e?.message ?? "Falha ao descobrir contas acessíveis.";
  }
  return out;
}

function formatDiscovery(d: Awaited<ReturnType<typeof discoverAccessibleIgAccounts>>): string {
  const igs = d.pages.filter((p) => p.ig_business_account_id);
  const owner = d.tokenOwner?.name ? ` (owner do token: ${d.tokenOwner.name}${d.tokenOwner.id ? ` #${d.tokenOwner.id}` : ""})` : "";
  if (d.error && d.pages.length === 0) {
    return `\n\nNão foi possível listar contas via /me/accounts${owner}: ${d.error}. Provavelmente este token não é de Usuário do Facebook com Páginas — se for um token do próprio IG (IGAA…), use um token de Página do Facebook vinculada, ou reconecte via Meta Business Login.`;
  }
  if (igs.length === 0) {
    return `\n\nO token${owner} não tem nenhuma Página do Facebook com Instagram Business vinculado. Vincule o Instagram à Página no Meta Business Suite e gere um novo token.`;
  }
  const list = igs.map((p) => `  • ${p.ig_username ? "@" + p.ig_username : "(sem username)"} — IG ID: ${p.ig_business_account_id} (Página: ${p.page_name} #${p.page_id})`).join("\n");
  return `\n\nEste token${owner} enxerga estes Instagram Business Accounts:\n${list}\n\nUse EXATAMENTE um dos IG IDs acima ao cadastrar a conta.`;
}

async function validateAccount(rawToken: string, rawIgId: string): Promise<ValidationResult> {
  const token = sanitizeToken(rawToken);
  const igId = String(rawIgId ?? "").trim();
  if (!token || !igId) {
    return { ok: false, status: "EMPTY", message: "Access Token ou Instagram Business ID vazio." };
  }
  if (!isValidTokenFormat(token)) {
    return { ok: false, status: "TOKEN_INVALID", message: "Token inválido ou formato incorreto. Verifique se não há espaços, quebras de linha ou caracteres especiais." };
  }

  try {
    const url = `${FB_BASE}/${encodeURIComponent(igId)}?fields=id,username&access_token=${encodeURIComponent(token)}`;
    console.log(`[instagram-credentials] validate GET ${FB_BASE}/${igId}?fields=id,username ig_id=${igId} token_len=${token.length}`);
    const igRes = await fetch(url);
    const ig = await readMeta(igRes);
    if (ig.data?.error) {
      const code = ig.data.error.code;
      const subcode = ig.data.error.error_subcode;
      const meta = ig.data.error.message ?? "";
      if (isApiBlocked(ig.data.error)) return { ok: false, status: "API_BLOCKED", message: `${BLOCKED_MSG} (${meta})` };
      if (code === 190) {
        return { ok: false, status: "TOKEN_EXPIRED", message: `${meta || "Token expirado."}\n\nGere um novo Access Token no Meta Business Suite / Facebook Developer e recadastre APENAS esta conta.` };
      }

      // Diagnóstico avançado: descobre o que este token realmente enxerga.
      const discovery = await discoverAccessibleIgAccounts(token);
      const discoveryText = formatDiscovery(discovery);
      const owns = discovery.pages.some((p) => p.ig_business_account_id === igId);
      const ownsHint = owns
        ? `\n\nObs.: o ID ${igId} APARECE na lista deste token — se ainda assim falhou, pode faltar a permissão instagram_content_publish neste token específico.`
        : `\n\nO ID cadastrado (${igId}) NÃO aparece na lista acima — ou o ID está errado, ou o token pertence a outro usuário/Página. Cada conta Instagram precisa do SEU próprio token gerado pelo dono da respectiva Página do Facebook.`;

      const base = `${meta || "Falha ao ler o Instagram User ID."} (code=${code}${subcode ? `, subcode=${subcode}` : ""})`;
      if (code === 100 || code === 803) {
        return {
          ok: false,
          status: "IG_ID_INVALID",
          message: `${base}\n\nDiagnóstico: o objeto ${igId} não existe OU este token não tem permissão para acessá-lo.${discoveryText}${ownsHint}`,
        };
      }
      return { ok: false, status: "IG_ID_INVALID", message: `${base}${discoveryText}${ownsHint}` };
    }

    if (!ig.data?.id) return { ok: false, status: "IG_ID_INVALID", message: "Instagram Business ID não retornou dados." };
    return {
      ok: true,
      status: "VALID",
      message: `Conta @${ig.data.username ?? "?"} validada (IG ID ${ig.data.id}).`,
      username: ig.data.username ?? null,
    };
  } catch (e: any) {
    return { ok: false, status: "UNKNOWN_ERROR", message: e?.message ?? "Falha ao consultar o Business ID." };
  }
}

const NOT_ADMIN_MSG =
  "O token informado não pertence a um usuário administrador de uma Página do Facebook. Reconecte utilizando o Meta Business Login.";

type DiscoveredPage = { page_id: string; page_name: string; ig_business_id?: string; ig_username?: string };

// Valida que o token é um User Access Token do Facebook capaz de listar /me/accounts
// e devolve as Páginas administradas com o Instagram Profissional vinculado.
async function fetchAdminPages(token: string): Promise<{ ok: boolean; error?: string; owner?: { id?: string; name?: string }; pages: DiscoveredPage[] }> {
  if (!token || !isValidTokenFormat(token)) {
    return { ok: false, error: "Token inválido ou formato incorreto. Remova espaços, quebras de linha e caracteres especiais.", pages: [] };
  }
  try {
    const meRes = await fetch(`${FB_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const me = await readMeta(meRes);
    if (me.data?.error || !me.data?.id) {
      return { ok: false, error: `${NOT_ADMIN_MSG} (${me.data?.error?.message ?? `HTTP ${me.status}`})`, pages: [] };
    }
    const pagesRes = await fetch(`${FB_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(token)}`);
    const pages = await readMeta(pagesRes);
    if (pages.data?.error || !Array.isArray(pages.data?.data)) {
      return { ok: false, error: `${NOT_ADMIN_MSG} (${pages.data?.error?.message ?? `HTTP ${pages.status}`})`, pages: [] };
    }
    if (pages.data.data.length === 0) {
      return { ok: false, error: NOT_ADMIN_MSG, pages: [] };
    }
    const list: DiscoveredPage[] = pages.data.data.map((p: any) => ({
      page_id: String(p.id),
      page_name: p.name ?? "",
      ig_business_id: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : undefined,
      ig_username: p.instagram_business_account?.username ?? undefined,
    }));
    return { ok: true, owner: { id: me.data.id, name: me.data.name }, pages: list };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Falha ao consultar a Graph API.", pages: [] };
  }
}

// Confirma na Graph API que a Página escolhida realmente possui o IG Business informado.
async function resolveIgIdForPage(token: string, pageId: string): Promise<{ ok: boolean; ig_business_id?: string; ig_username?: string; error?: string }> {
  try {
    const res = await fetch(`${FB_BASE}/${encodeURIComponent(pageId)}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
    const r = await readMeta(res);
    if (r.data?.error) return { ok: false, error: r.data.error.message ?? `HTTP ${r.status}` };
    const ig = r.data?.instagram_business_account;
    if (!ig?.id) {
      return { ok: false, error: "A Página selecionada não possui um Instagram Profissional (Business/Creator) vinculado. Vincule o Instagram à Página no Meta Business Suite e tente novamente." };
    }
    return { ok: true, ig_business_id: String(ig.id), ig_username: ig.username ?? undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Falha ao validar a Página." };
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
        const token = sanitizeToken(item.access_token);
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
      const access_token = sanitizeToken(body.access_token);
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
      let token = sanitizeToken(data?.access_token);
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

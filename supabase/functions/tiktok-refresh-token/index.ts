// Renova access_token do TikTok usando o refresh_token salvo em tiktok_credentials.
// Pode ser chamado explicitamente (body: { account }) ou em modo "auto" (renova todos
// os tokens que expiram nos próximos 10 minutos). O scheduler pode invocar sem body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
type Account = "resenha" | "frame";

async function refreshOne(supabase: any, row: any) {
  const clientKey = (Deno.env.get("TIKTOK_CLIENT_KEY") ?? "").trim();
  const clientSecret = (Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "").trim();
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_CLIENT_KEY/SECRET não configurados.");
  if (!row?.refresh_token) throw new Error(`Conta ${row?.account}: sem refresh_token salvo — reconecte pelo painel.`);

  const form = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: form.toString(),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.error) {
    const msg = json.error_description ?? json.error ?? text;
    await supabase.from("tiktok_credentials").update({
      last_validated_at: new Date().toISOString(),
      last_validation_status: "TOKEN_INVALID",
      last_validation_detail: `Refresh falhou: ${msg}`,
    }).eq("account", row.account);
    throw new Error(`Falha ao renovar token (${row.account}): ${msg}`);
  }

  const expiresIn = Number(json.expires_in ?? 0);
  const refreshExpiresIn = Number(json.refresh_expires_in ?? 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const refreshExpiresAt = refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null;

  const { error: upErr } = await supabase.from("tiktok_credentials").update({
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? row.refresh_token,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    scope: json.scope ?? row.scope,
    last_validated_at: new Date().toISOString(),
    last_validation_status: "VALID",
    last_validation_detail: "Token renovado com sucesso.",
  }).eq("account", row.account);
  if (upErr) throw upErr;

  return { account: row.account, ok: true, expires_at: expiresAt };
}

/** Garante um access_token válido; renova se faltar < `bufferSec`. */
export async function ensureValidToken(supabase: any, account: Account, bufferSec = 120) {
  const { data, error } = await supabase.from("tiktok_credentials").select("*").eq("account", account).maybeSingle();
  if (error) throw error;
  if (!data?.access_token) throw new Error(`Conta ${account} não conectada ao TikTok.`);
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (exp && exp - Date.now() > bufferSec * 1000) return data;
  await refreshOne(supabase, data);
  const { data: fresh } = await supabase.from("tiktok_credentials").select("*").eq("account", account).maybeSingle();
  return fresh;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const account: Account | undefined = body.account;

    let targets: any[] = [];
    if (account) {
      if (!["resenha", "frame"].includes(account)) throw new Error("Conta inválida.");
      const { data } = await supabase.from("tiktok_credentials").select("*").eq("account", account).maybeSingle();
      if (data) targets = [data];
    } else {
      // Auto: renova tudo que expira em < 10 min
      const cutoff = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data } = await supabase.from("tiktok_credentials")
        .select("*")
        .not("refresh_token", "is", null)
        .lte("expires_at", cutoff);
      targets = data ?? [];
    }

    const results: any[] = [];
    for (const row of targets) {
      try { results.push(await refreshOne(supabase, row)); }
      catch (e: any) { results.push({ account: row.account, ok: false, error: e?.message }); }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[tiktok-refresh-token]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao renovar tokens." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

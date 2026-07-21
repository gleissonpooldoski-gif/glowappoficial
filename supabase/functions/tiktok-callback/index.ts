// Recebe o redirect do TikTok após o consentimento, troca o `code` por
// access_token/refresh_token e salva em public.tiktok_credentials.
// URL pública: https://<project-ref>.supabase.co/functions/v1/tiktok-callback
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
const USERINFO_ENDPOINT = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,username";

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? "#10b981" : "#ef4444";
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b0b0f;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:480px;background:#15151c;border:1px solid #2a2a35;border-radius:16px;padding:32px;text-align:center}
h1{margin:0 0 12px;color:${color};font-size:20px}p{color:#a1a1aa;font-size:14px;line-height:1.5;margin:0 0 20px}
a{display:inline-block;background:#eab308;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p><a href="/">Voltar ao app</a></div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      return htmlResponse("Autorização negada", `${error}: ${errorDescription ?? "O usuário cancelou ou o TikTok recusou o consentimento."}`, false);
    }
    if (!code || !state) {
      return htmlResponse("Requisição inválida", "Parâmetros 'code' ou 'state' ausentes na URL de callback.", false);
    }

    // Recupera state (CSRF + PKCE)
    const { data: stateRow, error: stateErr } = await supabase
      .from("tiktok_oauth_states")
      .select("account, code_verifier")
      .eq("state", state)
      .maybeSingle();
    if (stateErr) throw stateErr;
    if (!stateRow) return htmlResponse("State inválido", "O state retornado não foi encontrado. Reinicie a conexão do TikTok.", false);

    // Descarta state após uso
    await supabase.from("tiktok_oauth_states").delete().eq("state", state);

    const clientKey = (Deno.env.get("TIKTOK_CLIENT_KEY") ?? "").trim();
    const clientSecret = (Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "").trim();
    const redirectUri = (Deno.env.get("TIKTOK_REDIRECT_URI") ?? "").trim();
    if (!clientKey || !clientSecret || !redirectUri) {
      return htmlResponse("Configuração ausente", "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET ou TIKTOK_REDIRECT_URI não configuradas no backend.", false);
    }

    // Troca do code por token
    const form = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: stateRow.code_verifier,
    });

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: form.toString(),
    });
    const tokenText = await tokenRes.text();
    let tokenJson: any = {};
    try { tokenJson = JSON.parse(tokenText); } catch { tokenJson = { raw: tokenText }; }

    if (!tokenRes.ok || tokenJson.error) {
      const msg = tokenJson.error_description ?? tokenJson.error ?? tokenText;
      console.error("[tiktok-callback] token error", tokenRes.status, msg);
      return htmlResponse("Falha ao obter token", String(msg), false);
    }

    const accessToken: string = tokenJson.access_token;
    const refreshToken: string | null = tokenJson.refresh_token ?? null;
    const scope: string | null = tokenJson.scope ?? null;
    const openId: string | null = tokenJson.open_id ?? null;
    const expiresIn = Number(tokenJson.expires_in ?? 0);
    const refreshExpiresIn = Number(tokenJson.refresh_expires_in ?? 0);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const refreshExpiresAt = refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null;

    // Busca username para exibir no painel
    let username: string | null = null;
    try {
      const uRes = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
      const uJson = await uRes.json();
      username = uJson?.data?.user?.username ?? uJson?.data?.user?.display_name ?? null;
    } catch (_) { /* opcional */ }

    const { error: upsertErr } = await supabase.from("tiktok_credentials").upsert({
      account: stateRow.account,
      open_id: openId,
      username,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      scope,
      last_validated_at: new Date().toISOString(),
      last_validation_status: "VALID",
      last_validation_detail: "Token obtido via OAuth callback.",
    }, { onConflict: "account" });

    if (upsertErr) {
      console.error("[tiktok-callback] upsert error", upsertErr);
      return htmlResponse("Falha ao salvar credenciais", upsertErr.message, false);
    }

    return htmlResponse(
      "TikTok conectado com sucesso ✅",
      `Conta <b>${stateRow.account.toUpperCase()}</b>${username ? ` (@${username})` : ""} autorizada. Você já pode fechar esta aba.`,
      true,
    );
  } catch (e: any) {
    console.error("[tiktok-callback] fatal", e?.message);
    return htmlResponse("Erro inesperado", e?.message ?? "Erro desconhecido no callback do TikTok.", false);
  }
});

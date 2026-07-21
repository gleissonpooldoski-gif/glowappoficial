// Recebe redirect do Google, troca code por tokens e persiste credenciais + info do canal.
// URL pública: https://<project-ref>.supabase.co/functions/v1/youtube-callback
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

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

    if (error) return htmlResponse("Autorização negada", error, false);
    if (!code || !state) return htmlResponse("Requisição inválida", "Parâmetros 'code' ou 'state' ausentes.", false);

    const { data: stateRow, error: stateErr } = await supabase
      .from("youtube_oauth_states")
      .select("account")
      .eq("state", state)
      .maybeSingle();
    if (stateErr) throw stateErr;
    if (!stateRow) return htmlResponse("State inválido", "O state retornado não foi encontrado. Reinicie a conexão.", false);
    await supabase.from("youtube_oauth_states").delete().eq("state", state);

    const clientId = (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim();
    const clientSecret = (Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "").trim();
    const redirectUri = (Deno.env.get("YOUTUBE_REDIRECT_URI") ?? "").trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return htmlResponse("Configuração ausente", "YOUTUBE_CLIENT_ID/SECRET/REDIRECT_URI não configurados.", false);
    }

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const tokenJson: any = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || tokenJson.error) {
      const msg = tokenJson.error_description ?? tokenJson.error ?? "Falha ao obter token.";
      console.error("[youtube-callback] token error", tokenRes.status, msg);
      return htmlResponse("Falha ao obter token", String(msg), false);
    }

    const accessToken: string = tokenJson.access_token;
    const refreshToken: string | null = tokenJson.refresh_token ?? null;
    const scope: string | null = tokenJson.scope ?? null;
    const expiresIn = Number(tokenJson.expires_in ?? 0);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    let channelId: string | null = null;
    let channelTitle: string | null = null;
    let thumbnail: string | null = null;
    try {
      const cRes = await fetch(CHANNELS_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
      const cJson = await cRes.json();
      const item = cJson?.items?.[0];
      if (item) {
        channelId = item.id ?? null;
        channelTitle = item.snippet?.title ?? null;
        thumbnail = item.snippet?.thumbnails?.default?.url ?? item.snippet?.thumbnails?.medium?.url ?? null;
      }
    } catch (_) { /* opcional */ }

    // Preserva refresh_token caso o Google não devolva um novo em reconexões
    let finalRefresh = refreshToken;
    if (!finalRefresh) {
      const { data: existing } = await supabase
        .from("youtube_credentials")
        .select("refresh_token")
        .eq("account", stateRow.account)
        .maybeSingle();
      finalRefresh = existing?.refresh_token ?? null;
    }

    const { error: upsertErr } = await supabase.from("youtube_credentials").upsert({
      account: stateRow.account,
      channel_id: channelId,
      channel_title: channelTitle,
      thumbnail,
      access_token: accessToken,
      refresh_token: finalRefresh,
      scope,
      expires_at: expiresAt,
      last_validated_at: new Date().toISOString(),
      last_validation_status: "VALID",
      last_validation_detail: "Token obtido via OAuth callback.",
    }, { onConflict: "account" });

    if (upsertErr) {
      console.error("[youtube-callback] upsert error", upsertErr);
      return htmlResponse("Falha ao salvar credenciais", upsertErr.message, false);
    }

    return htmlResponse(
      "YouTube conectado com sucesso ✅",
      `Canal <b>${channelTitle ?? stateRow.account}</b> autorizado. Você já pode fechar esta aba.`,
      true,
    );
  } catch (e: any) {
    console.error("[youtube-callback] fatal", e?.message);
    return htmlResponse("Erro inesperado", e?.message ?? "Erro desconhecido no callback do YouTube.", false);
  }
});

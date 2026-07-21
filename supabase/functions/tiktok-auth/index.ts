// Gera a URL de autorização do TikTok (OAuth 2.0 + PKCE) para uma das contas fixas
// e persiste o `state` + `code_verifier` para conferência no callback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_ENDPOINT = "https://www.tiktok.com/v2/auth/authorize/";
const DEFAULT_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer).slice(0, len);
}

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return base64url(digest);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const account = (body.account ?? new URL(req.url).searchParams.get("account") ?? "").toString();
    const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length ? body.scopes : DEFAULT_SCOPES;

    if (!["resenha", "frame"].includes(account)) {
      return new Response(JSON.stringify({ error: "Conta inválida. Use 'resenha' ou 'frame'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI");
    if (!clientKey || !redirectUri) {
      return new Response(JSON.stringify({ error: "TIKTOK_CLIENT_KEY ou TIKTOK_REDIRECT_URI não configurados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const state = randomString(48);
    const codeVerifier = randomString(64);
    const codeChallenge = await sha256(codeVerifier);

    const { error: insertErr } = await supabase.from("tiktok_oauth_states").insert({
      state, account, code_verifier: codeVerifier,
    });
    if (insertErr) throw insertErr;

    // Limpa states antigos (>1h)
    await supabase.from("tiktok_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 60 * 60_000).toISOString());

    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(","),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

    return new Response(JSON.stringify({ success: true, auth_url: authUrl, state, account }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[tiktok-auth]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao iniciar OAuth do TikTok." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Gera URL de autorização OAuth do Google/YouTube e persiste state (CSRF).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(len = 48): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer).slice(0, len);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const account = (body.account ?? "default").toString();

    const clientId = (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim();
    const redirectUri = (Deno.env.get("YOUTUBE_REDIRECT_URI") ?? "").trim();
    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "YOUTUBE_CLIENT_ID ou YOUTUBE_REDIRECT_URI não configurados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const state = randomString(48);

    const { error: insertErr } = await supabase.from("youtube_oauth_states").insert({ state, account });
    if (insertErr) throw insertErr;

    await supabase.from("youtube_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 60 * 60_000).toISOString());

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

    return new Response(JSON.stringify({ success: true, auth_url: authUrl, state, account }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[youtube-auth]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao iniciar OAuth do YouTube." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

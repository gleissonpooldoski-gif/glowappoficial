// Renova access_token do YouTube usando o refresh_token salvo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const account = (body.account ?? "default").toString();

    const clientId = (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim();
    const clientSecret = (Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "").trim();
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Credenciais do app YouTube ausentes." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cred, error: credErr } = await supabase
      .from("youtube_credentials")
      .select("*")
      .eq("account", account)
      .maybeSingle();
    if (credErr) throw credErr;
    if (!cred?.refresh_token) {
      return new Response(JSON.stringify({ error: "Conta não conectada ou sem refresh_token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: cred.refresh_token,
      grant_type: "refresh_token",
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const msg = json.error_description ?? json.error ?? "Falha ao renovar token.";
      await supabase.from("youtube_credentials").update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: "REFRESH_FAILED",
        last_validation_detail: String(msg),
      }).eq("account", account);
      return new Response(JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expiresIn = Number(json.expires_in ?? 0);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    await supabase.from("youtube_credentials").update({
      access_token: json.access_token,
      expires_at: expiresAt,
      scope: json.scope ?? cred.scope,
      last_validated_at: new Date().toISOString(),
      last_validation_status: "VALID",
      last_validation_detail: "Token renovado com sucesso.",
    }).eq("account", account);

    return new Response(JSON.stringify({ success: true, expires_at: expiresAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[youtube-refresh-token]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao renovar token." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

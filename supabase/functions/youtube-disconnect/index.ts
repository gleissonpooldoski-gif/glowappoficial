// Revoga o OAuth do Google para o canal informado e remove o registro em youtube_credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

async function revoke(token: string): Promise<{ ok: boolean; detail?: string }> {
  if (!token) return { ok: true };
  try {
    const res = await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    // 400 invalid_token = já revogado/expirado; tratamos como sucesso.
    if (res.status === 400 && text.includes("invalid_token")) return { ok: true };
    return { ok: false, detail: text || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "revoke failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const account = (body.account ?? "").toString().trim();
    if (!account) {
      return new Response(JSON.stringify({ error: "Parâmetro 'account' é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cred, error: credErr } = await supabase
      .from("youtube_credentials")
      .select("account, access_token, refresh_token")
      .eq("account", account)
      .maybeSingle();
    if (credErr) throw credErr;

    if (!cred) {
      return new Response(JSON.stringify({ success: true, already_disconnected: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Revoga refresh_token (invalida access_token também) e, por segurança, o access_token.
    const r1 = await revoke(cred.refresh_token ?? "");
    const r2 = await revoke(cred.access_token ?? "");

    const { error: delErr } = await supabase
      .from("youtube_credentials")
      .delete()
      .eq("account", account);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({
      success: true,
      revoked: r1.ok && r2.ok,
      revoke_detail: r1.ok ? r2.detail ?? null : r1.detail ?? null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[youtube-disconnect]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao desconectar." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

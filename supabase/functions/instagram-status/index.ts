// Consulta o status de uma publicação do Instagram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_VERSION = "v21.0";

function tokenFor(account: string) {
  if (account === "resenha") return Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? "";
  if (account === "frame") return Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? "";
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const postId = body.postId ?? url.searchParams.get("postId");
    let publishId = body.publish_id ?? url.searchParams.get("publish_id");
    let account = body.account ?? url.searchParams.get("account");

    if (postId) {
      const { data } = await supabase.from("instagram_posts").select("publish_id, account, status").eq("id", postId).maybeSingle();
      if (data) {
        publishId = publishId ?? data.publish_id;
        account = account ?? data.account;
      }
    }
    if (!publishId || !account) {
      return new Response(JSON.stringify({ error: "publish_id e account são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = tokenFor(account);
    if (!token) throw new Error(`Token ausente para conta '${account}'.`);

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${publishId}?fields=id,status,permalink,timestamp&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json();
    if (!res.ok || data?.error) {
      throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    }
    return new Response(JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[instagram-status]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro desconhecido." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Executa uploads do TikTok cujo horário agendado já chegou.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("tiktok_posts")
      .select("id")
      .eq("status", "AGENDADO")
      .lte("scheduled_at", nowIso)
      .limit(10);
    if (error) throw error;

    const results: any[] = [];
    for (const row of due ?? []) {
      const { data: claimed } = await supabase
        .from("tiktok_posts")
        .update({ status: "PUBLICANDO" })
        .eq("id", row.id)
        .eq("status", "AGENDADO")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        const invokeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tiktok-publish`;
        const res = await fetch(invokeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ postId: row.id }),
        });
        const j = await res.json().catch(() => ({}));
        results.push({ id: row.id, ok: !!j?.success, ...j });
      } catch (e: any) {
        await supabase.from("tiktok_posts").update({
          status: "ERRO", error_message: e?.message ?? "Falha no scheduler",
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: e?.message });
      }
    }
    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[tiktok-scheduler]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

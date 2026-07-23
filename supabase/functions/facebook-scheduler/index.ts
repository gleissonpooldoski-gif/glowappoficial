// Dispara publicações do Facebook cujo horário chegou. Mirrors instagram-scheduler.
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
      .from("facebook_posts")
      .select("id")
      .eq("status", "AGENDADO")
      .lte("scheduled_at", nowIso)
      .limit(10);
    if (error) throw error;

    // Recovery: PUBLICANDO travado por >10min → marca ERRO
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: stuck } = await supabase
      .from("facebook_posts")
      .select("id")
      .eq("status", "PUBLICANDO")
      .lte("updated_at", stale)
      .limit(10);

    const results: any[] = [];
    for (const row of due ?? []) {
      const { data: claimed } = await supabase
        .from("facebook_posts")
        .update({ status: "PUBLICANDO" })
        .eq("id", (row as any).id)
        .eq("status", "AGENDADO")
        .select("id").maybeSingle();
      if (!claimed) continue;

      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-facebook`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ postId: (row as any).id }),
        });
        const j = await res.json().catch(() => ({}));
        results.push({ id: (row as any).id, ok: !!j?.success, ...j });
      } catch (e: any) {
        await supabase.from("facebook_posts").update({
          status: "ERRO",
          error_message: e?.message ?? "Falha ao invocar publish-facebook",
        }).eq("id", (row as any).id);
        results.push({ id: (row as any).id, ok: false, error: e?.message });
      }
    }

    for (const row of stuck ?? []) {
      await supabase.from("facebook_posts").update({
        status: "ERRO",
        error_message: "Timeout: publicação ficou em PUBLICANDO por mais de 10 minutos.",
      }).eq("id", (row as any).id);
      results.push({ id: (row as any).id, recovery: true, ok: false });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

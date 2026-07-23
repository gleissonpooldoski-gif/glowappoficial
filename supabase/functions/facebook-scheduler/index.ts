// Dispara publicações do Facebook cujo horário chegou. Mirrors instagram-scheduler.
// Fire-and-forget: publish-facebook faz upload longo (30s+ com retries); NUNCA aguardar
// sequencialmente ou o scheduler estoura seu wall-clock em lotes multi-rede.
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
      .select("id, video_id, scheduled_at")
      .eq("status", "AGENDADO")
      .lte("scheduled_at", nowIso)
      .limit(25);
    if (error) throw error;

    // Recovery: PUBLICANDO travado por >10min → marca ERRO
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: stuck } = await supabase
      .from("facebook_posts")
      .select("id")
      .eq("status", "PUBLICANDO")
      .lte("updated_at", stale)
      .limit(25);

    console.log("[facebook-scheduler] tick", {
      now: nowIso,
      due_count: due?.length ?? 0,
      stuck_count: stuck?.length ?? 0,
    });

    const dispatched: any[] = [];
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-facebook`;

    // 1) Claim + dispatch em PARALELO (sem await no fetch — publicação roda no
    //    edge dedicado). Isso garante que múltiplas redes no mesmo horário
    //    disparem o FB junto com IG/YT.
    await Promise.all((due ?? []).map(async (row: any) => {
      const { data: claimed } = await supabase
        .from("facebook_posts")
        .update({ status: "PUBLICANDO" })
        .eq("id", row.id)
        .eq("status", "AGENDADO")
        .select("id").maybeSingle();
      if (!claimed) {
        console.log("[facebook-scheduler] skip (already claimed)", { id: row.id });
        return;
      }

      console.log("[facebook-scheduler] dispatch", {
        id: row.id, video_id: row.video_id, scheduled_at: row.scheduled_at,
      });

      // Fire-and-forget: NÃO aguarda o resultado. publish-facebook grava seu
      // próprio status/erro em facebook_posts.
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ postId: row.id }),
      }).catch(async (e) => {
        console.error("[facebook-scheduler] dispatch failed", { id: row.id, error: e?.message });
        await supabase.from("facebook_posts").update({
          status: "ERRO",
          error_message: e?.message ?? "Falha ao invocar publish-facebook",
        }).eq("id", row.id);
      });

      dispatched.push({ id: row.id, dispatched: true });
    }));

    // 2) Recovery de travados
    for (const row of stuck ?? []) {
      await supabase.from("facebook_posts").update({
        status: "ERRO",
        error_message: "Timeout: publicação ficou em PUBLICANDO por mais de 10 minutos.",
      }).eq("id", (row as any).id);
      dispatched.push({ id: (row as any).id, recovery: true });
      console.log("[facebook-scheduler] recovery ERRO", { id: (row as any).id });
    }

    return new Response(JSON.stringify({ ok: true, processed: dispatched.length, dispatched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[facebook-scheduler] fatal", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Executa uploads do YouTube cujo horário agendado já chegou.
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
      .from("youtube_posts")
      .select("*")
      .eq("status", "AGENDADO")
      .lte("scheduled_at", nowIso)
      .limit(5);
    if (error) throw error;

    const results: any[] = [];
    for (const row of due ?? []) {
      // Claim
      const { data: claimed } = await supabase
        .from("youtube_posts")
        .update({ status: "PUBLICANDO" })
        .eq("id", row.id)
        .eq("status", "AGENDADO")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        // Busca processed_path do vídeo
        const { data: video } = await supabase
          .from("videos")
          .select("processed_path, original_path")
          .eq("id", row.video_id)
          .maybeSingle();
        const path = video?.processed_path ?? video?.original_path;
        const bucket = video?.processed_path ? "videos-processed" : "videos";
        if (!path) throw new Error("Vídeo sem arquivo disponível.");

        const invokeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-upload`;
        const res = await fetch(invokeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            account: row.account,
            storage_bucket: bucket,
            storage_path: path,
            title: row.title,
            description: row.description,
            tags: row.tags,
            category_id: row.category_id,
            privacy_status: row.privacy_status,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
        await supabase.from("youtube_posts").update({
          status: "PUBLICADO",
          youtube_video_id: j.video_id,
          video_url: j.url,
          published_at: new Date().toISOString(),
          logs: [{ at: new Date().toISOString(), step: "upload", ok: true, response: j }],
        }).eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } catch (e: any) {
        await supabase.from("youtube_posts").update({
          status: "ERRO",
          error_message: e?.message ?? "Falha no upload",
          logs: [{ at: new Date().toISOString(), step: "upload", ok: false, error: e?.message }],
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: e?.message });
      }
    }
    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[youtube-scheduler]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

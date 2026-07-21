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
      // Busca linha completa (com logs, account, video_id etc.)
      const { data: full } = await supabase
        .from("youtube_posts").select("*").eq("id", row.id).maybeSingle();
      if (!full) continue;

      // Claim para evitar dupla execução.
      const { data: claimed } = await supabase
        .from("youtube_posts")
        .update({ status: "PUBLICANDO" })
        .eq("id", row.id).eq("status", "AGENDADO")
        .select("id").maybeSingle();
      if (!claimed) continue;

      const prevLogs = Array.isArray(full.logs) ? full.logs : [];
      const nowIso2 = () => new Date().toISOString();

      try {
        const { data: video } = await supabase
          .from("videos")
          .select("processed_path, original_path")
          .eq("id", full.video_id)
          .maybeSingle();
        const path = video?.processed_path ?? video?.original_path;
        const bucket = video?.processed_path ? "videos-processed" : "videos";
        if (!path) throw new Error("Vídeo sem arquivo permanente no Storage.");

        const startedLog = {
          at: nowIso2(), step: "youtube_publish_started",
          post_id: row.id, account: full.account,
          video_id: full.video_id, bucket, path,
          scheduled_at: full.scheduled_at,
        };
        console.log("[youtube-scheduler]", JSON.stringify(startedLog));
        await supabase.from("youtube_posts").update({ logs: [...prevLogs, startedLog] }).eq("id", row.id);

        const invokeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-upload`;
        const res = await fetch(invokeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            account: full.account,
            storage_bucket: bucket,
            storage_path: path,
            title: full.title,
            description: full.description,
            tags: full.tags,
            category_id: full.category_id,
            privacy_status: full.privacy_status,
          }),
        });
        const rawText = await res.text().catch(() => "");
        let j: any = {};
        try { j = rawText ? JSON.parse(rawText) : {}; } catch { j = { raw: rawText.slice(0, 500) }; }
        if (!res.ok || j.error) {
          throw new Error(j.error ?? j?.raw ?? `HTTP ${res.status} — ${rawText.slice(0, 200)}`);
        }

        const successLog = {
          at: nowIso2(), step: "youtube_publish_success",
          youtube_video_id: j.video_id, url: j.url,
        };
        console.log("[youtube-scheduler]", JSON.stringify(successLog));
        await supabase.from("youtube_posts").update({
          status: "PUBLICADO",
          youtube_video_id: j.video_id,
          video_url: j.url,
          published_at: nowIso2(),
          error_message: null,
          logs: [...prevLogs, startedLog, successLog],
        }).eq("id", row.id);

        if (full.auto_comment_enabled) {
          try {
            const commentUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-post-comment`;
            await fetch(commentUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ youtube_post_id: row.id }),
            });
          } catch (ce) { console.warn("[youtube-scheduler] comentário falhou:", (ce as any)?.message); }
        }

        results.push({ id: row.id, ok: true, video_id: j.video_id });
      } catch (e: any) {
        const errMsg = e?.message ?? "Falha no upload";
        const errorLog = {
          at: nowIso2(), step: "youtube_publish_error",
          error: errMsg,
        };
        console.error("[youtube-scheduler]", JSON.stringify(errorLog));
        await supabase.from("youtube_posts").update({
          status: "ERRO",
          error_message: errMsg.slice(0, 500),
          logs: [...prevLogs, errorLog],
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: errMsg });
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

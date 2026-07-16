// Edge Function: render-video
// Enqueues a rendering job for an external worker (FFmpeg/Shotstack/etc).
// This function NEVER spawns subprocesses — the Supabase Edge Runtime forbids it.
// The actual MP4 rendering happens in a separate worker that:
//   1) polls (or receives a webhook for) render_jobs rows with status='QUEUED'
//   2) downloads the referenced video/template via the signed URLs in `composition`
//   3) composes video + template + texts + audio with FFmpeg
//   4) uploads the MP4 to the `videos-processed` bucket
//   5) inserts a row into `videos` (status='finished')
//   6) updates the render_jobs row to status='COMPLETED' with output_path/output_url
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.object({ editId: z.string().uuid() });

const STORAGE_BUCKET_ORIGINALS = "videos";
const STORAGE_BUCKET_TEMPLATES = "media";

const RATIOS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json({ error: "Serviço de renderização não configurado." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        400,
      );
    }
    const editId = parsed.data.editId;

    const { data: edit, error: editError } = await admin
      .from("edits")
      .select("*")
      .eq("id", editId)
      .maybeSingle();
    if (editError) throw new Error(editError.message);
    if (!edit) throw new Error("Projeto de edição não encontrado.");

    const { data: video, error: videoError } = await admin
      .from("videos")
      .select("*")
      .eq("id", edit.video_id)
      .maybeSingle();
    if (videoError) throw new Error(videoError.message);
    if (!video) throw new Error("Vídeo original não encontrado.");

    // Signed URLs (30 min) so the external worker can download inputs
    let videoUrl: string | null = video.original_url ?? null;
    if (video.original_path) {
      const { data } = await admin.storage
        .from(STORAGE_BUCKET_ORIGINALS)
        .createSignedUrl(video.original_path, 60 * 30);
      if (data?.signedUrl) videoUrl = data.signedUrl;
    }
    if (!videoUrl) throw new Error("Vídeo original sem arquivo disponível.");

    let templateUrl: string | null = null;
    let templateMime: string | null = null;
    if (edit.template_id) {
      const { data: tpl } = await admin
        .from("templates")
        .select("*")
        .eq("id", edit.template_id)
        .maybeSingle();
      const path = tpl?.file_path ?? tpl?.storage_path ?? tpl?.path ?? null;
      if (path) {
        const { data } = await admin.storage
          .from(STORAGE_BUCKET_TEMPLATES)
          .createSignedUrl(path, 60 * 30);
        templateUrl = data?.signedUrl ?? null;
      } else {
        templateUrl = tpl?.preview_url ?? tpl?.file_url ?? edit.template_url ?? null;
      }
      templateMime = tpl?.file_type ?? null;
    }

    const ratio = RATIOS[edit.aspect_ratio as string] ?? RATIOS["9:16"];
    const composition = {
      version: 1,
      aspect_ratio: edit.aspect_ratio,
      width: ratio.width,
      height: ratio.height,
      duration_seconds: video.duration_seconds ?? null,
      video: { url: videoUrl, transform: (edit.doc as any)?.video ?? null },
      template: templateUrl
        ? { url: templateUrl, mime: templateMime, transform: (edit.doc as any)?.template ?? null }
        : null,
      texts: (edit.doc as any)?.texts ?? [],
      audio: { keep_original: true },
      output: { format: "mp4", codec: "h264" },
    };

    // Enqueue the job — NO subprocesses, NO ffmpeg here.
    const { data: job, error: jobError } = await admin
      .from("render_jobs")
      .insert({
        edit_id: editId,
        project_id: edit.project_id,
        video_id: edit.video_id,
        user_id: edit.owner_user_id ?? edit.user_id ?? null,
        status: "QUEUED",
        provider: "external-worker",
        composition,
        progress: 0,
      })
      .select("*")
      .single();
    if (jobError) throw new Error(jobError.message);

    await admin.from("edits").update({ status: "queued" }).eq("id", editId);

    // Optional: notify an external worker webhook if configured
    const workerUrl = Deno.env.get("RENDER_WORKER_URL");
    if (workerUrl) {
      try {
        await fetch(workerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(Deno.env.get("RENDER_WORKER_TOKEN")
              ? { Authorization: `Bearer ${Deno.env.get("RENDER_WORKER_TOKEN")}` }
              : {}),
          },
          body: JSON.stringify({ jobId: job.id }),
        });
      } catch (err) {
        console.warn("[render-video] worker webhook failed", err);
      }
    }

    return json({
      ok: true,
      jobId: job.id,
      status: job.status,
      message: workerUrl
        ? "Job enfileirado e enviado ao worker externo."
        : "Job enfileirado. Aguardando worker de renderização externo.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enfileirar renderização.";
    console.error("[render-video] enqueue failed", err);
    return json({ error: "Não foi possível criar o job de renderização.", details: message }, 500);
  }
});

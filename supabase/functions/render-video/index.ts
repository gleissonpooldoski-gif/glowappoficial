import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.object({
  editId: z.string().uuid(),
});

type TextAlign = "left" | "center" | "right";
type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

type TextEl = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  font: string;
  weight?: number;
  animation?: "none" | "fade" | "slide-up" | "pulse";
  transform?: TextTransform;
  lineHeight?: number;
  align?: TextAlign;
  shadow?: boolean;
  strokeWidth?: number;
  strokeColor?: string;
  bgColor?: string | null;
};

type EditDoc = {
  video?: { zoom?: number; x?: number; y?: number };
  template?: { opacity?: number; blend?: string; fit?: "contain" | "cover" };
  texts?: TextEl[];
};

const RATIOS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

const STORAGE_BUCKET_ORIGINALS = "videos";
const STORAGE_BUCKET_TEMPLATES = "media";
const STORAGE_BUCKET_READY = "videos-processed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const safeName = (value: unknown) =>
  String(value || "video")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "video";

const normalizeHex = (value: string | null | undefined, fallback = "FFFFFF") => {
  const raw = String(value || fallback).trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return raw.split("").map((c) => c + c).join("").toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback;
};

const ffColor = (value: string | null | undefined, fallback = "FFFFFF", alpha?: number) =>
  `0x${normalizeHex(value, fallback)}${alpha == null ? "" : `@${Math.max(0, Math.min(1, alpha)).toFixed(3)}`}`;

const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, "\\n");

const titleCase = (value: string) =>
  value.toLowerCase().replace(/(^|\s|[-_/])([\p{L}\p{N}])/gu, (_, sep, ch) => `${sep}${String(ch).toUpperCase()}`);

const applyTransform = (text: string, transform: TextTransform | undefined) => {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return titleCase(text);
  return text;
};

async function downloadUrlToFile(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Falha ao baixar arquivo [${res.status}]: ${await res.text().catch(() => "")}`);
  }
  const file = await Deno.open(path, { create: true, write: true, truncate: true });
  await res.body.pipeTo(file.writable);
}

async function storagePathToFile(client: ReturnType<typeof createClient>, bucket: string, objectPath: string, localPath: string) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 60 * 30);
  if (error || !data?.signedUrl) throw new Error(`Não foi possível acessar arquivo em ${bucket}: ${error?.message ?? "URL vazia"}`);
  await downloadUrlToFile(data.signedUrl, localPath);
}

async function runFfmpeg(args: string[]) {
  if (typeof Deno.Command !== "function") {
    throw new Error("Renderizador de vídeo do servidor indisponível neste ambiente.");
  }

  const command = new Deno.Command("ffmpeg", {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success) {
    console.error("[render-video] ffmpeg failed", { code: output.code, stderr });
    throw new Error(`Falha ao codificar MP4: ${stderr.slice(-1200) || `código ${output.code}`}`);
  }
}

function buildFilterGraph(doc: EditDoc, ratio: { width: number; height: number }, hasTemplate: boolean) {
  const W = ratio.width;
  const H = ratio.height;
  const zoom = Math.max(0.2, Number(doc.video?.zoom ?? 1));
  const vx = Number(doc.video?.x ?? 0) / 100 * W;
  const vy = Number(doc.video?.y ?? 0) / 100 * H;
  const filters: string[] = [];
  let current = "v0";
  let idx = 0;

  filters.push(
    `[0:v]scale=${Math.round(W * zoom)}:${Math.round(H * zoom)}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H}:max(0\\,min(iw-${W}\\,(iw-${W})/2-${vx.toFixed(2)})):` +
      `max(0\\,min(ih-${H}\\,(ih-${H})/2-${vy.toFixed(2)})),setsar=1,format=rgba[${current}]`,
  );

  if (hasTemplate) {
    const fit = doc.template?.fit === "cover" ? "cover" : "contain";
    const opacity = Math.max(0, Math.min(1, Number(doc.template?.opacity ?? 1)));
    const templateFilter = fit === "cover"
      ? `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[tpl]`
      : `[1:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[tpl]`;
    filters.push(templateFilter);
    idx += 1;
    filters.push(`[${current}][tpl]overlay=0:0:format=auto[v${idx}]`);
    current = `v${idx}`;
  }

  for (const t of doc.texts ?? []) {
    const text = escapeText(applyTransform(t.text || "Texto", t.transform));
    const size = Math.max(10, Math.round((Number(t.size || 42) / 720) * H));
    const x = Number(t.x ?? 50) / 100 * W;
    const y = Number(t.y ?? 50) / 100 * H;
    const align = t.align ?? "center";
    const xExpr = align === "left" ? `${x.toFixed(2)}` : align === "right" ? `${x.toFixed(2)}-text_w` : `${x.toFixed(2)}-text_w/2`;
    const yExpr = `${y.toFixed(2)}-text_h/2`;
    const font = escapeText(t.font || "Montserrat");
    const color = ffColor(t.color, "FFFFFF");
    const stroke = t.strokeWidth && t.strokeWidth > 0
      ? `:borderw=${Math.max(1, Math.round(t.strokeWidth))}:bordercolor=${ffColor(t.strokeColor, "000000")}`
      : "";
    const shadow = t.shadow === false ? "" : ":shadowcolor=0x000000@0.600:shadowx=2:shadowy=2";
    const box = t.bgColor ? `:box=1:boxcolor=${ffColor(t.bgColor, "000000", 0.72)}:boxborderw=${Math.round(size * 0.22)}` : "";
    const alpha = t.animation === "fade" ? ":alpha='min(1,t/0.35)'" : "";
    idx += 1;
    filters.push(
      `[${current}]drawtext=text='${text}':font='${font}':fontsize=${size}:fontcolor=${color}:` +
        `x=${xExpr}:y=${yExpr}:line_spacing=${Math.round(size * ((t.lineHeight ?? 1.2) - 1))}` +
        `${stroke}${shadow}${box}${alpha}[v${idx}]`,
    );
    current = `v${idx}`;
  }

  filters.push(`[${current}]format=yuv420p[vout]`);
  return filters.join(";");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let queueId: string | null = null;
  let editId: string | null = null;
  let tempDir: string | null = null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json({ error: "Renderizador do servidor não configurado." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados de exportação inválidos", details: parsed.error.flatten().fieldErrors }, 400);
    editId = parsed.data.editId;

    const { data: edit, error: editError } = await admin
      .from("edits")
      .select("*")
      .eq("id", editId)
      .maybeSingle();
    if (editError || !edit) throw new Error(editError?.message ?? "Projeto de edição não encontrado.");

    const { data: video, error: videoError } = await admin
      .from("videos")
      .select("*")
      .eq("id", edit.video_id)
      .maybeSingle();
    if (videoError || !video) throw new Error(videoError?.message ?? "Vídeo original não encontrado.");
    if (!video.original_path && !video.original_url && !edit.video_url) throw new Error("Vídeo original sem arquivo disponível para renderização.");

    const { data: queue, error: queueError } = await admin
      .from("processing_queue")
      .insert({
        video_id: edit.video_id,
        project_id: edit.project_id,
        template_id: edit.template_id,
        status: "processing",
        progress: 5,
        options: { edit_id: editId, renderer: "server-ffmpeg", aspect_ratio: edit.aspect_ratio },
      })
      .select("id")
      .single();
    if (queueError) throw queueError;
    queueId = queue.id;

    await admin.from("edits").update({ status: "processing", queue_id: queueId }).eq("id", editId);

    const doc = (edit.doc ?? {}) as EditDoc;
    const ratio = RATIOS[edit.aspect_ratio as string] ?? RATIOS["9:16"];
    tempDir = await Deno.makeTempDir({ prefix: "render-video-" });
    const inputPath = `${tempDir}/input`;
    const templatePath = `${tempDir}/template`;
    const outputPath = `${tempDir}/output.mp4`;

    if (video.original_path) await storagePathToFile(admin, STORAGE_BUCKET_ORIGINALS, video.original_path, inputPath);
    else await downloadUrlToFile(video.original_url || edit.video_url, inputPath);

    await admin.from("processing_queue").update({ progress: 25 }).eq("id", queueId);

    let templateInput = false;
    let templateIsVideo = false;
    if (edit.template_id) {
      const { data: template } = await admin.from("templates").select("*").eq("id", edit.template_id).maybeSingle();
      const templateStoragePath = template?.file_path ?? template?.storage_path ?? template?.path ?? null;
      const templateUrl = templateStoragePath ? null : (edit.template_url ?? template?.preview_url ?? template?.file_url ?? null);
      if (templateStoragePath || templateUrl) {
        try {
          if (templateStoragePath) await storagePathToFile(admin, STORAGE_BUCKET_TEMPLATES, templateStoragePath, templatePath);
          else await downloadUrlToFile(templateUrl, templatePath);
          const descriptor = `${template?.file_type ?? ""} ${templateStoragePath ?? templateUrl ?? ""}`;
          templateIsVideo = /video\//i.test(template?.file_type ?? "") || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(descriptor);
          templateInput = true;
        } catch (err) {
          console.warn("[render-video] template download skipped", err);
        }
      }
    }

    await admin.from("processing_queue").update({ progress: 40 }).eq("id", queueId);

    const filterGraph = buildFilterGraph(doc, ratio, templateInput);
    const args = ["-hide_banner", "-y", "-i", inputPath];
    if (templateInput) {
      if (templateIsVideo) args.push("-stream_loop", "-1", "-i", templatePath);
      else args.push("-loop", "1", "-i", templatePath);
    }
    args.push(
      "-filter_complex", filterGraph,
      "-map", "[vout]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      outputPath,
    );

    await runFfmpeg(args);
    await admin.from("processing_queue").update({ progress: 82 }).eq("id", queueId);

    const outputBytes = await Deno.readFile(outputPath);
    const owner = safeName(edit.owner_user_id ?? edit.user_id ?? "single-user");
    const filename = `${safeName(edit.name ?? video.filename)}_${Date.now()}.mp4`;
    const processedPath = `${owner}/${editId}/${filename}`;
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET_READY)
      .upload(processedPath, new Blob([outputBytes], { type: "video/mp4" }), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: inserted, error: insertError } = await admin
      .from("videos")
      .insert({
        project_id: edit.project_id,
        filename,
        processed_path: processedPath,
        duration_seconds: video.duration_seconds,
        size_bytes: outputBytes.byteLength,
        mime_type: "video/mp4",
        status: "finished",
        template_id: edit.template_id,
        progress: 100,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    await Promise.all([
      admin.from("processing_queue").update({ status: "done", progress: 100, error: null }).eq("id", queueId),
      admin.from("edits").update({ status: "completed" }).eq("id", editId),
    ]);

    return json({ ok: true, videoId: inserted.id, processedPath, filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha inesperada ao renderizar vídeo.";
    console.error("[render-video] failed", err);
    if (queueId) {
      await admin.from("processing_queue").update({ status: "error", progress: 100, error: message }).eq("id", queueId);
    }
    if (editId) await admin.from("edits").update({ status: "failed" }).eq("id", editId);
    return json({ error: "Não foi possível finalizar o vídeo no servidor.", details: message }, 500);
  } finally {
    if (tempDir) await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});
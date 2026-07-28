// Upload de vídeo para o YouTube via Data API v3 — resumable em CHUNKS.
//
// Correção do WORKER_RESOURCE_LIMIT: em vez de baixar o arquivo inteiro do
// Storage para a memória (supabase.storage.download() materializa um Blob),
// o arquivo é lido por faixas (HTTP Range) a partir de uma signed URL e
// enviado em pedaços de 8 MB. O pico de memória fica ~8 MB independentemente
// do tamanho do vídeo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  classifyYoutubeApiError,
  ensureAccessToken,
  resolveYoutubeCredential,
  sleep,
  YtError,
} from "../_shared/youtube-auth.ts";

const RESUMABLE_INIT_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const CHUNK_SIZE = 8 * 1024 * 1024; // múltiplo de 256 KB, exigido pelo protocolo resumable
const MAX_CHUNK_TRIES = 4;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const logs: Record<string, unknown>[] = [];
  const log = (entry: Record<string, unknown>) => {
    const e = { at: new Date().toISOString(), ...entry };
    logs.push(e);
    console.log("[youtube-upload]", JSON.stringify(e));
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) throw new YtError("UPLOAD_FAILED", "Título é obrigatório.");
    const description = String(body.description ?? "");
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.map((t: any) => String(t)).filter(Boolean)
      : String(body.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const categoryId = String(body.category_id ?? "22");
    const privacyStatus = ["private", "unlisted", "public"].includes(body.privacy_status)
      ? body.privacy_status
      : "private";

    log({ step: "youtube_upload_started", account: body.account ?? null, video_id: body.video_id ?? null, title });

    // ===== 1) Resolve canal + token (nunca usa token expirado) =====
    const cred = await resolveYoutubeCredential(supabase, {
      account: body.account,
      videoId: body.video_id ?? null,
      projectId: body.project_id ?? null,
    });
    log({ step: "youtube_channel_resolved", account: cred.account, channel_title: cred.channel_title });
    const accessToken = await ensureAccessToken(supabase, cred, log);

    // ===== 2) Localiza o arquivo no Storage =====
    let bucket: string | null = body.storage_bucket ?? null;
    let path: string | null = body.storage_path ?? null;
    let mime = "video/mp4";
    if (body.video_id) {
      const { data: video, error: vErr } = await supabase
        .from("videos").select("original_path, processed_path, mime_type").eq("id", body.video_id).maybeSingle();
      if (vErr) throw vErr;
      if (!video) throw new YtError("ASSET_MISSING", "Vídeo não encontrado no banco.");
      if (video.processed_path) { bucket = bucket ?? "videos-processed"; path = video.processed_path; }
      else if (video.original_path) { bucket = bucket ?? "videos"; path = video.original_path; }
      else throw new YtError("ASSET_MISSING", "Este item não possui arquivo de vídeo. Renderize o vídeo antes de publicar.");
      mime = video.mime_type || mime;
    }
    if (!bucket || !path) throw new YtError("ASSET_MISSING", "Arquivo do vídeo não informado.");

    const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (signErr || !signed?.signedUrl) {
      throw new YtError("ASSET_MISSING", `Arquivo não encontrado no Storage (${bucket}/${path}): ${signErr?.message ?? "sem URL"}`);
    }
    const sourceUrl = signed.signedUrl;

    const headRes = await fetch(sourceUrl, { method: "HEAD" });
    const totalSize = Number(headRes.headers.get("content-length") ?? 0);
    if (!headRes.ok || !totalSize) {
      throw new YtError("ASSET_MISSING", `Arquivo vazio ou inacessível no Storage (${bucket}/${path}).`);
    }
    log({ step: "youtube_asset_ready", bucket, path, size_bytes: totalSize, mime });

    // ===== 3) Inicia sessão resumable =====
    const initRes = await fetch(RESUMABLE_INIT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(totalSize),
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
    });
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => "");
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      throw classifyYoutubeApiError(initRes.status, parsed, text);
    }
    const uploadUrl = initRes.headers.get("location") ?? initRes.headers.get("Location");
    if (!uploadUrl) throw new YtError("UPLOAD_FAILED", "YouTube não retornou URL de upload resumable.");
    log({ step: "youtube_resumable_session_open", chunk_size: CHUNK_SIZE, chunks: Math.ceil(totalSize / CHUNK_SIZE) });

    // ===== 4) Envia em chunks de 8 MB com retry/backoff exponencial =====
    let offset = 0;
    let finalJson: any = null;
    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize) - 1;

      const rangeRes = await fetch(sourceUrl, { headers: { Range: `bytes=${offset}-${end}` } });
      if (!rangeRes.ok && rangeRes.status !== 206) {
        await rangeRes.body?.cancel();
        throw new YtError("ASSET_MISSING", `Falha ao ler faixa ${offset}-${end} do Storage (${rangeRes.status}).`);
      }
      const chunk = new Uint8Array(await rangeRes.arrayBuffer());

      let attempt = 0;
      let done = false;
      while (!done) {
        attempt++;
        try {
          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": mime,
              "Content-Length": String(chunk.byteLength),
              "Content-Range": `bytes ${offset}-${offset + chunk.byteLength - 1}/${totalSize}`,
            },
            body: chunk,
          });

          if (putRes.status === 308) {
            const range = putRes.headers.get("range");
            await putRes.body?.cancel();
            offset = range ? Number(range.split("-")[1]) + 1 : offset + chunk.byteLength;
            done = true;
          } else if (putRes.ok) {
            const text = await putRes.text().catch(() => "");
            try { finalJson = text ? JSON.parse(text) : null; } catch { finalJson = null; }
            offset = totalSize;
            done = true;
          } else {
            const text = await putRes.text().catch(() => "");
            let parsed: any = null;
            try { parsed = JSON.parse(text); } catch { /* noop */ }
            const err = classifyYoutubeApiError(putRes.status, parsed, text);
            if (err.transient && attempt < MAX_CHUNK_TRIES) {
              const delay = 1000 * 2 ** (attempt - 1);
              log({ step: "youtube_chunk_retry", offset, attempt, delay_ms: delay, reason: err.code, message: err.message });
              await sleep(delay);
              continue;
            }
            throw err;
          }
        } catch (netErr: any) {
          if (netErr instanceof YtError) throw netErr;
          if (attempt >= MAX_CHUNK_TRIES) {
            throw new YtError("UPLOAD_FAILED", `Falha de rede ao enviar o vídeo: ${netErr?.message ?? netErr}`, { transient: true });
          }
          const delay = 1000 * 2 ** (attempt - 1);
          log({ step: "youtube_chunk_network_retry", offset, attempt, delay_ms: delay, error: netErr?.message });
          await sleep(delay);
        }
      }
      log({ step: "youtube_chunk_sent", uploaded_bytes: offset, total_bytes: totalSize });
    }

    if (!finalJson?.id) {
      throw new YtError("UPLOAD_FAILED", "Upload concluído sem ID de vídeo retornado pelo YouTube.");
    }
    log({ step: "youtube_upload_finished", youtube_video_id: finalJson.id });

    return json({
      success: true,
      video_id: finalJson.id,
      url: `https://youtu.be/${finalJson.id}`,
      account: cred.account,
      snippet: finalJson.snippet,
      status: finalJson.status,
      logs,
    });
  } catch (e: any) {
    if (e instanceof YtError) {
      log({ step: "youtube_upload_error", code: e.code, message: e.message, transient: e.transient });
      return json({ ...e.toJSON(), logs }, e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 400);
    }
    console.error("[youtube-upload] unexpected", e?.message);
    return json({ error: e?.message ?? "Erro no upload.", code: "UPLOAD_FAILED", transient: false, logs }, 500);
  }
});

// Executa uploads do YouTube cujo horário agendado já chegou.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ==== SEGREDO DAS PROMOÇÕES — regras exclusivas =====================
// Aplicadas SOMENTE quando o projeto do vídeo for identificado como SEGREDO.
// Nenhum outro projeto (FRAME, RESENHA) tem o comportamento alterado.
function isSegredoProject(name?: string | null, cat?: string | null): boolean {
  const s = `${name ?? ""} ${cat ?? ""}`.toLowerCase();
  return s.includes("segredo") || s.includes("promo") || s.includes("achad");
}

const SEGREDO_RETRY_DELAYS_MS = [30_000, 120_000];
// Backoff exponencial aplicado a TODOS os projetos em erros transitórios.
const RETRY_DELAYS_MS = [15_000, 60_000];
const MAX_FILE_SIZE_BYTES = 256 * 1024 * 1024 * 1024; // 256GB (limite YouTube)
const MAX_SHORTS_DURATION_S = 180; // 3 min — margem confortável para Shorts

function isTransientYoutubeError(status: number, raw: string, parsed: any): boolean {
  if (status >= 500) return true;
  if (status === 429) return true;
  const reason = String(parsed?.error?.errors?.[0]?.reason ?? "").toLowerCase();
  const msg = String(parsed?.error?.message ?? raw ?? "").toLowerCase();
  if (reason.includes("backend") || reason.includes("rate") || reason.includes("quota")) return true;
  if (msg.includes("timeout") || msg.includes("temporar") || msg.includes("unavailable") ||
      msg.includes("try again") || msg.includes("internal error")) return true;
  return false;
}

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

      const prevLogs: any[] = Array.isArray(full.logs) ? full.logs : [];
      const runLogs: any[] = [];
      const pushLog = async (entry: any) => {
        runLogs.push(entry);
        console.log("[youtube-scheduler]", JSON.stringify(entry));
        await supabase.from("youtube_posts").update({ logs: [...prevLogs, ...runLogs] }).eq("id", row.id);
      };
      const nowIso2 = () => new Date().toISOString();

      try {
        const { data: video } = await supabase
          .from("videos")
          .select("id, project_id, processed_path, original_path, mime_type, duration_seconds, thumbnail_url, thumbnail_path")
          .eq("id", full.video_id)
          .maybeSingle();
        const path = video?.processed_path ?? video?.original_path;
        const bucket = video?.processed_path ? "videos-processed" : "videos";
        if (!path) throw new Error("Vídeo sem arquivo permanente no Storage.");

        // Detecta projeto SEGREDO DAS PROMOÇÕES
        let isSegredo = false;
        if (video?.project_id) {
          const { data: proj } = await supabase.from("projects")
            .select("name, category").eq("id", video.project_id).maybeSingle();
          isSegredo = isSegredoProject(proj?.name, (proj as any)?.category);
        }

        // ===== Pré-validação (SEGREDO apenas) =====
        if (isSegredo) {
          const preflight: Record<string, any> = {
            title_ok: !!(full.title && String(full.title).trim()),
            description_ok: !!(full.description && String(full.description).trim()),
            tags_ok: Array.isArray(full.tags) && full.tags.length > 0,
            category_ok: !!full.category_id,
            thumbnail_ok: !!(video?.thumbnail_url || video?.thumbnail_path),
            duration_seconds: video?.duration_seconds ?? null,
            mime_type: video?.mime_type ?? null,
            bucket, path,
          };
          // Confirma arquivo existe / obtém tamanho
          try {
            const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
            const name = path.split("/").pop()!;
            const { data: listed } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 1 });
            const found = (listed ?? []).find((f: any) => f.name === name);
            preflight.file_exists = !!found;
            preflight.file_size = (found as any)?.metadata?.size ?? null;
          } catch (le) {
            preflight.file_exists = false;
            preflight.file_check_error = (le as any)?.message;
          }

          const problems: string[] = [];
          if (!preflight.title_ok) problems.push("título ausente");
          if (!preflight.description_ok) problems.push("descrição ausente");
          if (!preflight.tags_ok) problems.push("tags ausentes");
          if (!preflight.category_ok) problems.push("categoria ausente");
          if (!preflight.file_exists) problems.push("arquivo não encontrado no storage");
          if (preflight.file_size && preflight.file_size > MAX_FILE_SIZE_BYTES) problems.push("arquivo excede limite YouTube");
          if (preflight.duration_seconds && preflight.duration_seconds > MAX_SHORTS_DURATION_S) {
            problems.push(`duração ${preflight.duration_seconds}s excede Shorts (${MAX_SHORTS_DURATION_S}s)`);
          }
          const mime = String(preflight.mime_type ?? "").toLowerCase();
          if (mime && !mime.startsWith("video/")) problems.push(`mime incompatível: ${mime}`);

          await pushLog({
            at: nowIso2(), step: "youtube_preflight",
            project: "SEGREDO_DAS_PROMOCOES",
            preflight, problems,
          });

          if (problems.length) {
            throw new Error(`Pré-validação falhou: ${problems.join("; ")}`);
          }
        }

        await pushLog({
          at: nowIso2(), step: "youtube_publish_started",
          post_id: row.id, account: full.account,
          video_id: full.video_id, bucket, path,
          scheduled_at: full.scheduled_at,
          project: isSegredo ? "SEGREDO_DAS_PROMOCOES" : undefined,
        });

        const invokeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-upload`;
        const doUpload = async () => {
          const res = await fetch(invokeUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              account: full.account,
              video_id: full.video_id,
              project_id: video?.project_id ?? null,
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
          return { res, j, rawText };
        };

        let uploadResult: { res: Response; j: any; rawText: string } | null = null;
        // SEGREDO: retry escalonado. Outros projetos: comportamento original (1 tentativa).
        const delays = isSegredo ? SEGREDO_RETRY_DELAYS_MS : RETRY_DELAYS_MS;
        const attempts = delays.length + 1;
        let lastErr: any = null;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          const r = await doUpload();
          if (r.res.ok && !r.j?.error) { uploadResult = r; break; }
          const transient = r.j?.transient === true || isTransientYoutubeError(r.res.status, r.rawText, r.j);
          lastErr = {
            at: nowIso2(), step: "youtube_publish_attempt_failed",
            attempt, http_status: r.res.status,
            error_code: r.j?.code ?? r.j?.error?.code ?? r.j?.status ?? null,
            error_message: r.j?.error?.message ?? r.j?.error ?? r.rawText?.slice(0, 400) ?? null,
            transient, project: isSegredo ? "SEGREDO_DAS_PROMOCOES" : undefined,
          };
          await pushLog(lastErr);
          if (!transient || attempt >= attempts) break;
          const delay = delays[attempt - 1] ?? 0;
          await pushLog({ at: nowIso2(), step: "youtube_retry_scheduled", delay_ms: delay, next_attempt: attempt + 1 });
          await new Promise((r) => setTimeout(r, delay));
        }

        if (!uploadResult) {
          const code = lastErr?.error_code ? `[${lastErr.error_code}] ` : "";
          throw new Error(`${code}${lastErr?.error_message ?? "Falha no upload do YouTube."}`);
        }
        const j = uploadResult.j;

        const successLog = {
          at: nowIso2(), step: "youtube_publish_success",
          youtube_video_id: j.video_id, url: j.url,
        };
        await pushLog(successLog);
        await supabase.from("youtube_posts").update({
          status: "PUBLICADO",
          youtube_video_id: j.video_id,
          video_url: j.url,
          published_at: nowIso2(),
          error_message: null,
        }).eq("id", row.id);

        // Comentário automático — SEMPRE separado da publicação.
        // Falha aqui NUNCA cancela ou reverte o vídeo já publicado.
        if (full.auto_comment_enabled && j.video_id) {
          try {
            const commentUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-post-comment`;
            const cRes = await fetch(commentUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ youtube_post_id: row.id }),
            });
            if (!cRes.ok) {
              const ct = await cRes.text().catch(() => "");
              await pushLog({ at: nowIso2(), step: "youtube_comment_failed", http_status: cRes.status, error: ct.slice(0, 300) });
            } else {
              await pushLog({ at: nowIso2(), step: "youtube_comment_ok" });
            }
          } catch (ce: any) {
            await pushLog({ at: nowIso2(), step: "youtube_comment_failed", error: ce?.message ?? String(ce) });
          }
        }

        results.push({ id: row.id, ok: true, video_id: j.video_id });
      } catch (e: any) {
        const errMsg = e?.message ?? "Falha no upload";
        const errorLog = {
          at: nowIso2(), step: "youtube_publish_error",
          error: errMsg,
        };
        console.error("[youtube-scheduler]", JSON.stringify(errorLog));
        runLogs.push(errorLog);
        await supabase.from("youtube_posts").update({
          status: "ERRO",
          error_message: errMsg.slice(0, 500),
          logs: [...prevLogs, ...runLogs],
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
